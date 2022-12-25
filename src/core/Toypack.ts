import {
	ResolveOptions,
	ToypackOptions,
	AssetInterface,
	ToypackLoader,
	ToypackPlugin,
	ParsedAsset,
	CompiledAsset,
	BundleResult,
} from "@toypack/core/types";
import {
	BabelLoader,
	JSONLoader,
	AssetLoader,
	CSSLoader,
} from "@toypack/loaders";
import { NodePolyfillPlugin } from "@toypack/plugins";
import { defaultOptions } from "@toypack/core/options";
import applyUMD from "@toypack/formats/umd";

import { merge as mergeObjects, cloneDeep as cloneObject } from "lodash";
import { isURL, getBtoa, isLocal, formatPath } from "@toypack/utils";
import * as path from "path-browserify";
import mime from "mime-types";
import MagicString, { Bundle } from "magic-string";
import SourceMap from "./SourceMap";
import babelMinify from "babel-minify";

import MapCombiner from "combine-source-map";
import MapConverter from "convert-source-map";

import autoprefixer from "autoprefixer";

const styleExtensions = [".css", ".sass", ".scss", ".less"];
const appExtensions = [".js", ".json", ".jsx", ".ts", ".tsx", ".html", ".vue"];
// prettier-ignore
const resourceExtensions = [".png",".jpg",".jpeg",".gif",".svg",".bmp",".tiff",".tif",".woff",".woff2",".ttf",".eot",".otf",".webp",".mp3",".mp4",".wav",".mkv",".m4v",".mov",".avi",".flv",".webm",".flac",".mka",".m4a",".aac",".ogg", ".map"];
const textExtensions = [...appExtensions, ...styleExtensions];

interface Hooks {
	done: (fn: Function) => void;
	failedResolve: (fn: Function) => void;
}

(window as any).path = path;

import PackageManager, { InstallationResult } from "./PackageManager";
export default class Toypack {
	public assets: Map<string, AssetInterface> = new Map();
	public options: ToypackOptions = cloneObject(defaultOptions);
	public loaders: ToypackLoader[] = [];
	public plugins: ToypackPlugin[] = [];
	public outputSource: string = "";
	public dependencies = {};
	public packageManager = new PackageManager(this);
	public _sourceMapConfig;
	public _lastId: number = 0;
	private _prevContentURL;
	private _prevContentDocURL;
	private _graphCache: Map<string, AssetInterface> = new Map();
	constructor(options?: ToypackOptions) {
		if (options) {
			this.defineOptions(options);
		}

		this._sourceMapConfig = [];
		let sourceMapConfig = this.options.bundleOptions?.output?.sourceMap;
		if (typeof sourceMapConfig == "string") {
			this._sourceMapConfig = sourceMapConfig.split("-");
		}

		/* Default loaders */
		this.addLoader(new BabelLoader());
		this.addLoader(new JSONLoader());
		this.addLoader(new CSSLoader());
		this.addLoader(new AssetLoader());

		/* Default plugins */
		this.addPlugin(new NodePolyfillPlugin());
		this.options.postCSSOptions?.plugins?.push(autoprefixer);
	}

	public hooks: Hooks = {
		done: this._tapHook.bind([this, "done"]),
		failedResolve: this._tapHook.bind([this, "failedResolve"]),
	};

	private _taps: any = {};

	public _tapHook(fn: Function) {
		let compiler = this[0];
		let hookName = this[1];
		if (typeof fn == "function") {
			if (!compiler._taps[hookName]) {
				compiler._taps[hookName] = [];
			}

			compiler._taps[hookName].push(fn);
		}
	}

	private async _initHooks(hookName: string, ...args) {
		let hooks = this._taps[hookName];
		if (hooks) {
			for (let fn of hooks) {
				await fn(...args);
			}
		}
	}

	public addLoader(loader: ToypackLoader) {
		this.loaders.push(loader);
	}

	public addPlugin(plugin: ToypackPlugin) {
		this.plugins.push(plugin);
	}

	private _getLoader(source: string) {
		for (let loader of this.loaders) {
			if (loader.test.test(source)) {
				return loader;
			}
		}
	}

	public defineOptions(options: ToypackOptions) {
		mergeObjects(this.options, options);
	}

	public async addDependency(
		name: string,
		version = "",
		warn: boolean = true
	): Promise<InstallationResult> {
		if (this.options.bundleOptions?.autoAddDependencies && warn) {
			console.warn(
				"Add Dependency Warning: Auto install dependencies is turned on. It is not recommended to manually add dependencies while this option is enabled. Set `options.autoAddDependencies` to `false` when adding dependencies manually."
			);
		}
		// Fetch dependency
		const dep = await this.packageManager.get(name, version);

		// Add to assets
		let depSource = path.join("node_modules", dep.name, dep.path);
		for (let asset of dep.graph) {
			let assetSource = path.join(depSource, asset.source);
			await this.addAsset(assetSource, asset.content);
		}

		// Update dependencies
		this.dependencies[dep.name] = "^" + dep.version;

		// Update the package.json's dependencies
		let packageJSON = this.assets.get("/package.json");
		let pkg = JSON.parse((packageJSON?.content as string) || "{}");

		if (packageJSON) {
			if (pkg.dependencies) {
				pkg.dependencies = Object.assign(pkg.dependencies, this.dependencies);
			} else {
				pkg.dependencies = this.dependencies;
			}

			packageJSON.content = JSON.stringify(pkg);
		} else {
			await this.addAsset(
				"/package.json",
				JSON.stringify({
					dependencies: this.dependencies,
				})
			);
		}

		return dep;
	}

	public createAsset(source: string, content: string | ArrayBuffer) {
		let isExternal = isURL(source);
		source = isExternal ? source : path.join("/", source);
		let cached = this.assets.get(source);
		let id = cached ? cached.id : ++this._lastId;
		let type = mime.lookup(source) || "";
		let extension = path.extname(source);

		let loader = this._getLoader(source);

		if (!loader) {
			throw new Error(
				`Asset Error: ${source} is not supported. You might want to add a loader for this file type.`
			);
		}

		let name = "asset-" + id + extension;

		let asset: AssetInterface = {
			id,
			name,
			source,
			content,
			type,
			extension,
			loader,
			loaderData: {
				parse: {
					dependencies: [],
				},
				compile: {
					content: {} as MagicString,
				},
			},
			dependencyMap: {},
			contentURL: "",
			blob: {} as Blob,
		};

		return asset;
	}

	private _createURL(asset: AssetInterface) {
		let url: string = "";
		if (this.options.bundleOptions?.mode == "production") {
			if (isURL(asset.source)) {
				url = asset.source;
			} else {
				if (this.options.bundleOptions?.output?.asset == "inline") {
					let base64 = getBtoa(asset.content);
					url = `data:${asset.type};base64,${base64}`;
				} else {
					url = asset.name;
				}
			}
		} else {
			// Revoke previous URL
			if (asset?.contentURL?.startsWith("blob:")) {
				URL.revokeObjectURL(asset?.contentURL);
			}

			url = URL.createObjectURL(asset.blob);
		}

		return url;
	}

	public async addAsset(source: string, content: string | ArrayBuffer = "") {
		let isExternal = isURL(source);
		source = isExternal ? source : path.join("/", source);

		let cached = this.assets.get(source);
		if (cached) {
			if (cached.content === content || isURL(cached.source)) {
				return cached;
			}
		}

		let asset: AssetInterface = this.createAsset(source, content);

		// Fetch if source is external url and not cached
		if (isExternal && !cached) {
			let fetchResponse = await fetch(source);
			if (textExtensions.includes(asset.extension)) {
				asset.content = await fetchResponse.text();
			} else {
				asset.content = await fetchResponse.arrayBuffer();
			}
		}

		// Create blob and content URLs
		asset.blob = new Blob([asset.content], {
			type: asset.type,
		});

		asset.contentURL = this._createURL(asset);

		// Out
		this.assets.set(source, asset);

		return asset;
	}

	public resolve(x: string, options?: ResolveOptions) {
		if (typeof x !== "string") {
			throw new TypeError("Path must be a string.");
		}

		let result = "";
		let orig = x;

		// Resolve.extensions
		let extensions = [...textExtensions, ...resourceExtensions];
		let priorityExtensions = this.options.bundleOptions?.resolve?.extensions;
		if (priorityExtensions) {
			for (let priorityExtension of priorityExtensions) {
				let index = extensions.indexOf(priorityExtension);
				if (index >= 0) {
					extensions.splice(index, 1);
				}
			}

			extensions = [...priorityExtensions, ...extensions];
		}

		const opts = Object.assign(
			{
				extensions,
				baseDir: ".",
				includeCoreModules: true,
			},
			options
		);

		// Resolve.alias
		let aliasData = this._getResolveAliasData(x);
		if (aliasData) {
			let aliasRegex = new RegExp(`^${aliasData.alias}`);
			if (aliasRegex.test(x)) {
				let aliasIsCoreModule =
					!isLocal(aliasData.replacement) && !isURL(aliasData.replacement);
				if (aliasIsCoreModule) {
					x = aliasData.replacement;
				} else {
					let target = path.join(
						aliasData.replacement,
						x.replace(aliasRegex, "")
					);

					target = path.join("/", target);
					let resolvedAlias = path.relative(opts.baseDir, target);

					x = resolvedAlias;
				}
			}
		}

		const loadAsDirectory = (x: string) => {
			let pkg = this.assets.get(path.join(x, "package.json"));

			if (typeof pkg?.content == "string") {
				let main = JSON.parse(pkg.content).main;
				if (!main) {
					return loadIndex(x);
				} else {
					let absolutePath = path.join(x, main);
					let file = loadAsFile(absolutePath);

					if (file) {
						return file;
					} else {
						let index = loadIndex(absolutePath);

						if (index) {
							return index;
						} else {
							return loadIndex(x);
						}
					}
				}
			} else {
				return loadIndex(x);
			}
		};

		const loadAsFile = (x: string) => {
			let parsedPath = path.parse(x);
			let noExt = path.join(parsedPath.dir, parsedPath.name);

			for (let i = 0; i < opts.extensions.length; i++) {
				let extension = opts.extensions[i];
				let asset = this.assets.get(noExt + extension);

				if (asset) {
					return asset.source;
				}
			}

			return "";
		};

		const loadIndex = (x: string) => {
			let resolvedIndex = path.join(x, "index");
			return loadAsFile(resolvedIndex);
		};

		const resolve = (x: string) => {
			if (opts.includeCoreModules && !isLocal(x) && !isURL(x)) {
				let resolved = path.join("/", "node_modules", x);
				return loadAsDirectory(resolved);
			} else if (isURL(x)) {
				return x;
			} else {
				let resolved = path.join("/", opts.baseDir, x);
				let file = loadAsFile(resolved);
				if (file) {
					return file;
				} else {
					return loadAsDirectory(resolved);
				}
			}
		};

		result = resolve(x);

		// Resolve.fallback
		if (!result) {
			let fallbackData = this._getResolveFallbackData(orig);
			if (fallbackData) {
				result = resolve(fallbackData?.fallback);
			}
		}

		return result;
	}

	private _getResolveFallbackData(str: string) {
		let fallbacks = this.options.bundleOptions?.resolve?.fallback;
		if (fallbacks) {
			for (let [id, fallback] of Object.entries(fallbacks)) {
				if (str.startsWith(id)) {
					return {
						id,
						fallback,
					};
				}
			}
		}
	}

	private _getResolveAliasData(str: string) {
		let aliases = this.options.bundleOptions?.resolve?.alias;
		if (aliases) {
			for (let [alias, replacement] of Object.entries(aliases)) {
				if (str.startsWith(alias)) {
					return {
						alias,
						replacement,
					};
				}
			}
		}
	}

	private async _createGraph(source: string, graph: AssetInterface[] = []) {
		let isExternal = isURL(source);
		source = isExternal ? source : path.join("/", source);

		let asset = this.assets.get(source);

		if (!asset) {
			throw new Error(`Graph Error: Cannot find asset ${source}`);
		}

		if (
			isExternal ||
			typeof asset.content != "string" ||
			typeof asset.loader.parse != "function"
		) {
			graph.push(asset);
		} else {
			let cached = this._graphCache.get(source);
			let parseData: ParsedAsset = { dependencies: [] };

			// Reuse the old parse data if content didn't change
			if (asset.content == cached?.content && cached?.loaderData.parse) {
				parseData = cached.loaderData.parse;
			} else {
				parseData = await asset.loader.parse(asset, this);
			}

			// Update asset's loader data
			asset.loaderData.parse = parseData;
			asset.dependencyMap = {};

			// Add to graph
			graph.push(asset);

			// Cache
			this._graphCache.set(asset.source, Object.assign({}, asset));

			// Scan asset's dependencies
			for (let dependency of parseData.dependencies) {
				let dependencyAbsolutePath: string = dependency;
				let baseDir = path.dirname(source);
				let isExternal = isURL(dependency);
				let isCoreModule = !isLocal(dependency) && !isExternal;

				// Check if aliased
				let aliasData = this._getResolveAliasData(dependency);
				if (aliasData) {
					isCoreModule =
						!isLocal(aliasData.replacement) && !isURL(aliasData.replacement);
				}

				// If not a url, resolve
				if (!isExternal) {
					// Auto install
					if (this.options.bundleOptions?.autoAddDependencies && isCoreModule) {
						await this.addDependency(
							aliasData ? aliasData.replacement : dependency,
							"",
							false
						);
					}

					// Resolve
					let resolved = this.resolve(dependency, {
						baseDir,
					});

					if (!resolved) {
						await this._initHooks("failedResolve", dependency);
						resolved = this.resolve(dependency, {
							baseDir,
						});
					}

					if (resolved) {
						dependencyAbsolutePath = resolved;
					}
				} else {
					// If a URL and not in cache, add to assets
					if (!this._graphCache.get(dependency)) {
						await this.addAsset(dependency);
					}
				}

				let dependencyAsset = this.assets.get(dependencyAbsolutePath);

				if (dependencyAsset) {
					// Add to dependency mapping
					asset.dependencyMap[dependency] = dependencyAsset.id;

					// Scan
					let isAdded = graph.some(
						(asset) => asset.source == dependencyAbsolutePath
					);

					if (!isAdded) {
						await this._createGraph(dependencyAbsolutePath, graph);
					}
				} else {
					throw new Error(
						`Graph Error: Could not resolve "${dependencyAbsolutePath}" at "${source}".`
					);
				}
			}
		}

		return graph;
	}

	public async bundle() {
		if (this === (window as any).toypack) {
			console.time("Total Bundle Time");
		}

		for (let plugin of this.plugins) {
			await plugin.apply(this);
		}

		let entrySource = this.resolve(
			path.join("/", this.options.bundleOptions?.entry || "")
		);

		if (!entrySource) {
			throw new Error(`Bundle Error: Entry point not found.`);
		}

		this.outputSource = formatPath(
			entrySource,
			this.options.bundleOptions?.output?.filename || ""
		);

		let entryOutputPath = path.join(
			this.options.bundleOptions?.output?.path || "",
			this.outputSource
		);

		let sourceMapOutputSource = entryOutputPath + ".map";

		let graph = await this._createGraph(entrySource);
		let bundle = new Bundle();
		let sourceMap: MapCombiner | null = null;

		if (
			this.options.bundleOptions?.output?.sourceMap &&
			this.options.bundleOptions?.mode == "development"
		) {
			sourceMap = MapCombiner.create(sourceMapOutputSource);
		}

		let prevLine = 0;

		for (let i = 0; i < graph.length; i++) {
			const asset = graph[i];
			const isFirst = i === 0;
			const isLast = i === graph.length - 1 || graph.length == 1;
			const isCoreModule = /^\/?node_modules\/?/.test(asset.source);

			let chunkContent = {} as MagicString;
			let chunkSourceMap: SourceMap = new SourceMap();

			// [1] - Compile
			let compiled: CompiledAsset = {} as CompiledAsset;
			if (typeof asset.loader.compile == "function") {
				compiled = await asset.loader.compile(asset, this);
			}

			if (!compiled.content && !isCoreModule) {
				let content = typeof asset.content == "string" ? asset.content : "";
				compiled.content = new MagicString(content);
			}

			// Save to loader data
			asset.loaderData.compile = compiled;

			// Update chunk
			chunkContent = compiled.content;
			chunkSourceMap.mergeWith(compiled.map);

			// [2] - Transform
			/* let transformed: CompiledAsset = {} as CompiledAsset;

			// Only transform if asset didn't come from an external URL
			let isObscure =
				!textExtensions.includes(asset.extension) || isURL(asset.source);

			if (!isObscure && compiled.babelTransform && !isCoreModule) {
				let babelTransformOptions = {};
				if (typeof compiled.babelTransform == "object") {
					babelTransformOptions = compiled.babelTransform;
				}

				transformed = transform(
					chunkContent.clone(),
					asset,
					this,
					babelTransformOptions
				);
			}

			if (!transformed.content) {
				transformed.content = chunkContent;
			}

			// Update chunk
			chunkContent = transformed.content;
			chunkSourceMap.mergeWith(transformed.map); */

			// [3] - Format
			let formatted = applyUMD(chunkContent.clone(), asset, this, {
				entryId: this.assets.get(entrySource)?.id,
				isFirst,
				isLast,
			});

			// Update chunk
			chunkContent = formatted.content;
			chunkSourceMap.mergeWith(formatted.map);

			// [4] - Add to bundle
			bundle.addSource({
				filename: asset.source,
				content: chunkContent,
			});

			if (
				sourceMap &&
				chunkSourceMap &&
				textExtensions.includes(asset.extension) &&
				typeof asset.content == "string" &&
				!isCoreModule
			) {
				chunkSourceMap.mergeWith(
					chunkContent.generateMap({
						source: asset.source,
						includeContent: false,
						hires: this._sourceMapConfig[1] == "original",
					})
				);

				// Add sources content
				if (this._sourceMapConfig[2] == "sources") {
					chunkSourceMap.sourcesContent[0] = asset.content;
				}

				sourceMap.addFile(
					{
						sourceFile: asset.source,
						source: chunkSourceMap.toComment(),
					},
					{
						line: prevLine,
					}
				);
			}

			prevLine += chunkContent.toString().split("\n").length;
		}

		//
		let finalContent = bundle.toString();

		if (sourceMap) {
			let sourceMapObject = MapConverter.fromBase64(
				sourceMap?.base64()
			).toObject();

			if (this._sourceMapConfig[2] == "nosources") {
				sourceMapObject.sourcesContent = [];
			}

			if (
				this.options.bundleOptions?.mode == "development" ||
				this._sourceMapConfig[0] == "inline"
			) {
				finalContent += MapConverter.fromObject(sourceMapObject).toComment();
			} else {
				// Out source map
				await this.addAsset(
					sourceMapOutputSource,
					JSON.stringify(sourceMapObject)
				);

				let sourceMapBasename = path.basename(sourceMapOutputSource);

				finalContent += `\n//# sourceMappingURL=${sourceMapBasename}`;
			}
		}

		let bundleResult: BundleResult = {
			content: finalContent,
			contentURL: null,
			contentDocURL: null,
		};

		if (this._prevContentURL?.startsWith("blob:")) {
			URL.revokeObjectURL(this._prevContentURL);
		}

		let contentURL = URL.createObjectURL(
			new Blob([finalContent], {
				type: "application/javascript",
			})
		);

		this._prevContentURL = contentURL;

		// prettier-ignore
		let contentDoc =
			// prettier-ignore
`<!DOCTYPE html>
<html>
	<head>
		<script defer type="module" src="${contentURL}"></script>
	</head>
	<body>
	</body>
</html>
`;
		if (this._prevContentDocURL?.startsWith("blob:")) {
			URL.revokeObjectURL(this._prevContentDocURL);
		}

		let contentDocURL = URL.createObjectURL(
			new Blob([contentDoc], {
				type: "text/html",
			})
		);

		this._prevContentDocURL = contentDocURL;
		bundleResult.contentURL = contentURL;
		bundleResult.contentDocURL = contentDocURL;

		// Out
		if (this.options.bundleOptions?.mode == "production") {
			// Out bundle
			await this.addAsset(entryOutputPath, bundleResult.content);

			// Out resources
			if (this.options.bundleOptions?.output?.asset == "external") {
				for (let asset of graph) {
					// Skip if not a local resource
					if (!(asset.loader instanceof AssetLoader) || isURL(asset.source))
						continue;
					let resource = asset;
					let resourceOutputFilename = formatPath(
						resource.source,
						this.options.bundleOptions?.output?.assetFilename || ""
					);
					let resourceOutputPath = path.join(
						this.options.bundleOptions?.output?.path || "",
						resourceOutputFilename
					);

					await this.addAsset(resourceOutputPath, bundleResult.content);
				}
			}
		}

		if (this === (window as any).toypack) {
			console.log(bundleResult);
			console.timeEnd("Total Bundle Time");
		}

		await this._initHooks("done");

		return bundleResult;
	}
}
