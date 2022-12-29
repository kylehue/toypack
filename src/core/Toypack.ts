import {
	ResolveOptions,
	ToypackOptions,
	AssetInterface,
	ToypackLoader,
	ToypackPlugin,
	ParsedAsset,
	CompiledAsset,
	BundleResult,
	BundleOptions,
} from "@toypack/core/types";
import {
	BabelLoader,
	JSONLoader,
	AssetLoader,
	CSSLoader,
	HTMLLoader,
} from "@toypack/loaders";
import { NodePolyfillPlugin } from "@toypack/plugins";
import { defaultOptions } from "@toypack/core/options";
import applyUMD from "@toypack/formats/umd";

import {
	merge as mergeObjects,
	cloneDeep as cloneObject,
	cloneDeep,
} from "lodash";
import { isURL, getBtoa, isLocal, formatPath } from "@toypack/utils";
import * as path from "path-browserify";
import mime from "mime-types";
import MagicString, { Bundle } from "magic-string";
import SourceMap from "./SourceMap";
import babelMinify from "babel-minify";

import MapCombiner from "combine-source-map";
import MapConverter from "convert-source-map";

import PackageManager from "./PackageManager";
import { transform } from "@babel/standalone";

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

export default class Toypack {
	public assets: Map<string, AssetInterface> = new Map();
	public options: ToypackOptions = cloneObject(defaultOptions);
	public loaders: ToypackLoader[] = [];
	public plugins: ToypackPlugin[] = [];
	public outputSource: string = "";
	public dependencies = {};
	public packageManager;
	public _sourceMapConfig;
	public _lastId: number = 0;
	private _prevContentURL;
	private _prevContentDocURL;
	private _graphCache: Map<string, AssetInterface> = new Map();
	private _bundleCache: Map<string, AssetInterface> = new Map();
	constructor(options?: ToypackOptions) {
		if (options) {
			this.defineOptions(options);
		}

		this._sourceMapConfig = [];
		let sourceMapConfig = this.options.bundleOptions?.output?.sourceMap;
		if (typeof sourceMapConfig == "string") {
			this._sourceMapConfig = sourceMapConfig.split("-");
		}

		this.packageManager = new PackageManager(this);

		/* Default loaders */
		this.addLoader(new BabelLoader());
		this.addLoader(new JSONLoader());
		this.addLoader(new CSSLoader());
		this.addLoader(new AssetLoader());
		this.addLoader(new HTMLLoader());

		/* Default plugins */
		this.addPlugin(new NodePolyfillPlugin());

		/*  */
		this.addAsset(
			"/node_modules/toypack/empty/index.js",
			"module.exports = {};"
		);
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
			isObscure: !textExtensions.includes(extension) || isURL(source),
			isModified: true,
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
			// Revoke previous URL if there's one
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
			let aliased = path.join(aliasData.replacement, x.replace(aliasData.alias, ""));
			let aliasIsCoreModule =
				!isLocal(aliasData.replacement) && !isURL(aliasData.replacement);
			
			if (!aliasIsCoreModule) {
				aliased = "./" + path.relative(opts.baseDir, aliased);
			}

			x = aliased;
		}

		const tryFileThenIndex = (x: string) => {
			let file = loadAsFile(x);

			if (file) {
				return file;
			} else {
				let index = loadIndex(x);

				if (index) {
					return index;
				} else {
					return loadIndex(x);
				}
			}
		};

		const loadAsDirectory = (x: string) => {
			let pkg = this.assets.get(path.join(x, "package.json"));

			if (typeof pkg?.content == "string") {
				let main = JSON.parse(pkg.content).main;
				if (!main) {
					return tryFileThenIndex(x);
				} else {
					let absolutePath = path.join(x, main);
					return tryFileThenIndex(absolutePath);
				}
			} else {
				return tryFileThenIndex(x);
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
				if (typeof fallbackData.fallback == "boolean") {
					result = "/node_modules/toypack/empty/index.js";
				} else if (typeof fallbackData.fallback == "string") {
					result = resolve(fallbackData.fallback);
				}
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
			// Find strict equals first
			for (let [alias, replacement] of Object.entries(aliases)) {
				if (str === alias) {
					return {
						alias,
						replacement,
					};
				}
			}

			for (let [alias, replacement] of Object.entries(aliases)) {
				let aliasRegex = new RegExp(`^${alias}/`);
				if (aliasRegex.test(str)) {
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

		const asset = this.assets.get(source);

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
			let parseData: ParsedAsset = { dependencies: [] };
			let cached = this._graphCache.get(source);
			asset.isModified = asset.content !== cached?.content;
			// Reuse the old parse data if content didn't change
			if (!asset.isModified && asset?.loaderData.parse) {
				parseData = asset.loaderData.parse;
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

	public async bundle(options?: BundleOptions) {
		if (options) {
			options = mergeObjects(
				cloneDeep(this.options.bundleOptions || {}),
				options
			);
		} else {
			options = this.options.bundleOptions;
		}

		let entrySource = this.resolve(path.join("/", options?.entry || ""));

		if (!entrySource) {
			throw new Error(`Bundle Error: Entry point not found.`);
		}

		for (let plugin of this.plugins) {
			if (!plugin._applied) {
				await plugin.apply(this);
				plugin._applied = true;
			}
		}

		this.outputSource = formatPath(
			entrySource,
			options?.output?.filename || ""
		);

		let entryOutputPath = path.join(
			options?.output?.path || "",
			this.outputSource
		);

		let sourceMapOutputSource = entryOutputPath + ".map";

		console.time("Total Graph Time");
		let graph = await this._createGraph(entrySource);
		console.timeEnd("Total Graph Time");
		let bundle = new Bundle();
		let sourceMap: MapCombiner | null = null;

		console.time("Total Bundle Time");

		if (options?.output?.sourceMap && options?.mode == "development") {
			sourceMap = MapCombiner.create(sourceMapOutputSource);
		}

		let prevLine = 0;

		for (let i = 0; i < graph.length; i++) {
			const asset = graph[i];
			const cached = this._bundleCache.get(asset.source);
			asset.isModified = asset.content !== cached?.content;

			if (!asset.isModified && asset.compilationData) {
				bundle.addSource({
					filename: asset.source,
					content: asset.compilationData.content,
				});

				if (asset.compilationData.isMapped) {
					sourceMap?.addFile(
						{
							sourceFile: asset.source,
							source: asset.compilationData.map.toComment(),
						},
						{
							line: prevLine,
						}
					);
				}

				prevLine += asset.compilationData.offset;
				console.log("%c Cached: ", "color: gold;", asset.source);
				continue;
			}

			let chunkContent = {} as MagicString;
			let chunkSourceMap: SourceMap = new SourceMap();

			const isFirst = i === 0;
			const isLast = i === graph.length - 1 || graph.length == 1;
			const isCoreModule = /^\/node_modules\//.test(asset.source);

			// [1] - Compile
			let compiled: CompiledAsset = {} as CompiledAsset;
			if (typeof asset.loader.compile == "function") {
				compiled = await asset.loader.compile(asset, this);
				console.log("%c Compiled: ", "color: red;", asset.source);
			}

			// If compiler didn't return any content, use asset's raw content
			// This is for assets that don't need compilation
			if (!compiled.content) {
				let rawContent = typeof asset.content == "string" ? asset.content : "";
				compiled.content = new MagicString(rawContent);
			}

			// Save to loader data
			asset.loaderData.compile = compiled;

			// Update chunk
			chunkContent = compiled.content;
			chunkSourceMap.mergeWith(compiled.map);

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

			let isMapped =
				!!sourceMap &&
				!!chunkSourceMap &&
				textExtensions.includes(asset.extension) &&
				typeof asset.content == "string" &&
				!isCoreModule;

			if (isMapped) {
				chunkSourceMap.mergeWith(
					chunkContent.generateMap({
						source: asset.source,
						includeContent: false,
						hires: this._sourceMapConfig[1] == "original",
					})
				);

				// Add sources content
				if (
					this._sourceMapConfig[2] == "sources" &&
					typeof asset.content == "string"
				) {
					chunkSourceMap.sourcesContent[0] = asset.content;
				}

				sourceMap?.addFile(
					{
						sourceFile: asset.source,
						source: chunkSourceMap.toComment(),
					},
					{
						line: prevLine,
					}
				);
			}

			// Offset source map
			let offset = 0;
			if (sourceMap) {
				offset = chunkContent.toString().split("\n").length;
				prevLine += offset;
			}

			// Cache
			if (asset.isModified) {
				asset.compilationData = {
					content: chunkContent,
					map: chunkSourceMap,
					offset,
					isMapped,
				};

				this._bundleCache.set(asset.source, Object.assign({}, asset));
			}
		}

		//
		let finalContent = bundle.toString();

		// Minify if in production mode
		if (options?.mode == "production") {
			let transpiled = transform(finalContent, {
				presets: ["es2015-loose"],
			});

			let minified = babelMinify(transpiled.code, {
				mangle: {
					topLevel: true,
					keepClassName: true,
				},
			});

			finalContent = minified.code;
		}

		if (sourceMap) {
			let sourceMapObject = MapConverter.fromBase64(
				sourceMap?.base64()
			).toObject();

			if (this._sourceMapConfig[2] == "nosources") {
				sourceMapObject.sourcesContent = [];
			}

			if (
				options?.mode == "development" ||
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

		let contentDoc = `<!DOCTYPE html>
<html>
	<head>
		<script defer src="${contentURL}"></script>
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
		if (options?.mode == "production") {
			// Out bundle
			await this.addAsset(entryOutputPath, bundleResult.content);

			// Out resources
			if (options?.output?.asset == "external") {
				for (let asset of graph) {
					// Skip if not a local resource
					if (!(asset.loader instanceof AssetLoader) || isURL(asset.source))
						continue;
					let resource = asset;
					let resourceOutputFilename = formatPath(
						resource.source,
						options?.output?.assetFilename || ""
					);
					let resourceOutputPath = path.join(
						options?.output?.path || "",
						resourceOutputFilename
					);

					await this.addAsset(resourceOutputPath, bundleResult.content);
				}
			}
		}
		console.log(bundleResult);
		console.timeEnd("Total Bundle Time");

		await this._initHooks("done");

		return bundleResult;
	}
}
