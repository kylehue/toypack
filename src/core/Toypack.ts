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

const colors = {
	success: "#3fe63c",
	warning: "#f5b514",
	danger: "#e61c1c",
	info: "#3b97ed",
};

function getTimeColor(time: number) {
	if (time < 5000) {
		return colors.success;
	} else if (time < 10000) {
		return colors.warning;
	} else {
		return colors.danger;
	}
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
				parse: null,
				compile: null,
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
			let aliased = path.join(
				aliasData.replacement,
				x.replace(aliasData.alias, "")
			);
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
				return loadIndex(x);
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

	public _getResolveFallbackData(str: string) {
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

	public _getResolveAliasData(str: string) {
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
			asset.isModified = false;
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

		let graphTotalTime: number = 0;
		let graphStartTime: number = 0;
		if (options?.logs) {
			graphStartTime = performance.now();
		}

		let graph = await this._createGraph(entrySource);

		let bundleTotalTime: number = 0;
		let bundleStartTime: number = 0;
		if (options?.logs) {
			bundleStartTime = performance.now();
			graphTotalTime = bundleStartTime - graphStartTime;
		}

		let bundle = new Bundle();
		let sourceMap: MapCombiner | null = null;

		if (options?.output?.sourceMap && options?.mode == "development") {
			sourceMap = MapCombiner.create(sourceMapOutputSource);
		}

		let cachedCounter = 0;
		let compiledCounter = 0;

		let prevLine = 0;

		for (let i = 0; i < graph.length; i++) {
			const asset = graph[i];

			let chunkContent = {} as MagicString;
			let chunkSourceMap: SourceMap = new SourceMap();

			const isFirst = i === 0;
			const isLast = i === graph.length - 1 || graph.length == 1;
			const isCoreModule = /^\/node_modules\//.test(asset.source);

			// [1] - Compile
			let compiled: CompiledAsset = {} as CompiledAsset;
			if (asset.isModified || !asset.loaderData.compile?.content) {
				if (typeof asset.loader.compile == "function") {
					compiled = await asset.loader.compile(asset, this);
				}
				compiledCounter++;
			} else {
				compiled = asset.loaderData.compile;
				cachedCounter++;
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

			// [2] - Format
			let formatted = applyUMD(chunkContent.clone(), asset, this, {
				entryId: this.assets.get(entrySource)?.id,
				isFirst,
				isLast,
			});

			// Update chunk
			chunkContent = formatted.content;
			chunkSourceMap.mergeWith(formatted.map);

			// [3] - Add to bundle
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
			if (sourceMap) {
				let offset = chunkContent.toString().split("\n").length;
				prevLine += offset;
			}
		}

		//
		let finalContent = bundle.toString();

		// Minify if in production mode
		if (options?.mode == "production") {
			let transpiled = transform(finalContent, {
				presets: ["env", "es2015-loose"],
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
			contentDoc: null,
			contentDocURL: null,
		};

		if (this._prevContentURL?.startsWith("blob:")) {
			URL.revokeObjectURL(this._prevContentURL);
		}

		bundleResult.contentURL = URL.createObjectURL(
			new Blob([finalContent], {
				type: "application/javascript",
			})
		);

		this._prevContentURL = bundleResult.contentURL;

		bundleResult.contentDoc = `<!DOCTYPE html>
<html>
	<head>
		<script defer src="${bundleResult.contentURL}"></script>
	</head>
	<body>
	</body>
</html>
`;
		
		
		if (this._prevContentDocURL?.startsWith("blob:")) {
			URL.revokeObjectURL(this._prevContentDocURL);
		}

		bundleResult.contentDocURL = URL.createObjectURL(
			new Blob([bundleResult.contentDoc], {
				type: "text/html",
			})
		);

		this._prevContentDocURL = bundleResult.contentDocURL;

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

		if (options?.logs) {
			bundleTotalTime = performance.now() - bundleStartTime;

			console.log(
				`%cTotal graph time: %c${graphTotalTime.toFixed(0)} ms`,
				"font-weight: bold; color: white;",
				"color: " + getTimeColor(graphTotalTime)
			);
			
			console.log(
				`%cTotal bundle time: %c${bundleTotalTime.toFixed(0)} ms`,
				"font-weight: bold; color: white;",
				"color: " + getTimeColor(bundleTotalTime)
			);

			console.log(
				`%cCached assets: %c${cachedCounter.toString()}`,
				"font-weight: bold; color: white;",
				"color: #cfd0d1;"
			);

			console.log(
				`%cCompiled assets: %c${compiledCounter.toString()}`,
				"font-weight: bold; color: white;",
				"color: #cfd0d1;"
			);
		}

		await this._initHooks("done");

		return bundleResult;
	}
}
