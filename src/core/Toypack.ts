import {
	ResolveOptions,
	ToypackOptions,
	AssetInterface,
	Loader,
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
import { defaultOptions } from "@toypack/core/options";
import applyUMD from "@toypack/formats/umd";

import mergeObjects from "lodash.merge";
import { isURL, getBtoa, isLocal, formatPath } from "@toypack/utils";
import * as path from "path";
import mime from "mime-types";
import MagicString, { Bundle } from "magic-string";
import { createSourceMap, SourceMap } from "./SourceMap";
import transform, { ImportedModule } from "./transform";

import MapCombiner from "combine-source-map";
import MapConverter from "convert-source-map";

import autoprefixer from "autoprefixer";

const styleExtensions = [".css", ".sass", ".scss", ".less"];
const appExtensions = [".js", ".json", ".jsx", ".ts", ".tsx", ".html", ".vue"];
// prettier-ignore
const resourceExtensions = [".png",".jpg",".jpeg",".gif",".svg",".bmp",".tiff",".tif",".woff",".woff2",".ttf",".eot",".otf",".webp",".mp3",".mp4",".wav",".mkv",".m4v",".mov",".avi",".flv",".webm",".flac",".mka",".m4a",".aac",".ogg", ".map"];
const textExtensions = [...appExtensions, ...styleExtensions];
const skypackURL = "https://cdn.skypack.dev/";

import packageManager from "./PackageManager";
export default class Toypack {
	public assets: Map<string, AssetInterface> = new Map();
	public options: ToypackOptions = defaultOptions;
	public loaders: Loader[] = [];
	public outputSource: string = "";
	public dependencies = {};
	public _sourceMapConfig;
	private _lastId: number = 0;
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

		this.addLoader(new BabelLoader());
		this.addLoader(new JSONLoader());
		this.addLoader(new CSSLoader());
		this.addLoader(new AssetLoader());

		this.options.postCSSOptions?.plugins?.push(autoprefixer);
	}

	public addLoader(loader: Loader) {
		this.loaders.push(loader);
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

	public async addDependency(name: string, version = "") {
		this.dependencies[name] = version;
		return await packageManager.get(name, version);
	}

	private _createAsset(source: string, content: string | ArrayBuffer) {
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

		let asset: AssetInterface = this._createAsset(source, content);

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

		const opts = Object.assign(
			{
				extensions: [...textExtensions, ...resourceExtensions],
				baseDir: ".",
				includeCoreModules: true,
			},
			options
		);

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
	}

	private async _createGraph(source: string, graph: AssetInterface[] = []) {
		let isExternal = isURL(source);
		source = isExternal ? source : path.join("/", source);
		let asset = this.assets.get(source);

		if (!asset) {
			throw new Error(`Graph Error: Cannot find asset ${source}.`);
		}

		if (
			isExternal ||
			typeof asset.content != "string" ||
			typeof asset.loader.parse != "function"
		) {
			graph.push(asset);
		} else {
			let cached = this._graphCache.get(source);
			let parseData: ParsedAsset;

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
				// Skip core modules
				let isCoreModule = !isLocal(dependency) && !isURL(dependency);
				if (isCoreModule) continue;

				let dependencyAbsolutePath: string = dependency;

				// If not a url, resolve
				if (!isURL(dependency)) {
					let resolved = this.resolve(dependency, {
						baseDir: path.dirname(source),
						includeCoreModules: false,
					});

					if (resolved) {
						dependencyAbsolutePath = resolved;
					}
				} else {
					// If a URL and not in cache, add to assets
					if (!this._graphCache.get(dependency)) {
						await this.addAsset(dependency);
					}
				}

				// Add to dependency mapping
				asset.dependencyMap[dependency] = this.assets.get(
					dependencyAbsolutePath
				)?.id;

				// Scan
				let isAdded = graph.some(
					(asset) => asset.source == dependencyAbsolutePath
				);

				if (!isAdded) {
					await this._createGraph(dependencyAbsolutePath, graph);
				}
			}
		}

		return graph;
	}

	public async bundle() {
		console.time("Total Bundle Time");
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
		let importedCoreModules: ImportedModule[] = [];
		let bundle = new Bundle();
		let sourceMap: MapCombiner | null = null;

		if (this.options.bundleOptions?.output?.sourceMap) {
			sourceMap = MapCombiner.create(sourceMapOutputSource);
		}

		let prevLine = 0;

		for (let i = 0; i < graph.length; i++) {
			const asset = graph[i];
			const isFirst = i === 0;
			const isLast = i === graph.length - 1 || graph.length == 1;

			let chunkContent = {} as MagicString;
			let chunkSourceMap: SourceMap = {} as SourceMap;

			const addToChunkMap = (map) => {
				if (map && this.options.bundleOptions?.output?.sourceMap) {
					let chunkSourceMapIsEmpty = !chunkSourceMap.version;
					if (!chunkSourceMapIsEmpty) {
						chunkSourceMap.mergeWith(map);
					} else {
						chunkSourceMap = createSourceMap(map);
					}
				}
			};

			// [1] - Compile
			let compiled: CompiledAsset = {} as CompiledAsset;
			if (typeof asset.loader.compile == "function") {
				compiled = await asset.loader.compile(asset, this);
			} else {
				let content = typeof asset.content == "string" ? asset.content : "";
				compiled.content = new MagicString(content);
			}

			// Save to loader data
			asset.loaderData.compile = compiled;

			// Update chunk
			chunkContent = compiled.content;
			addToChunkMap(compiled.map);

			// [2] - Transform
			let transformed: CompiledAsset = {} as CompiledAsset;

			// Only transform if asset didn't come from an external URL
			let isObscure =
				!textExtensions.includes(asset.extension) || isURL(asset.source);

			if (!isObscure) {
				transformed = transform(chunkContent, asset, this);
			} else {
				transformed.content = chunkContent;
				if (chunkSourceMap) {
					transformed.map = chunkSourceMap;
				}
			}

			// Update imported core modules
			if (transformed.metadata?.coreModules?.length) {
				for (let coreModule of transformed.metadata.coreModules) {
					let isAdded = importedCoreModules.some(
						(cm: ImportedModule) => cm.imported === coreModule.imported
					);

					if (!isAdded) {
						importedCoreModules.push(coreModule);
					}
				}
			}

			// Update chunk
			chunkContent = transformed.content;
			addToChunkMap(transformed.map);

			// [3] - Format
			let formatted = applyUMD(chunkContent, asset, this, {
				entryId: this.assets.get(entrySource)?.id,
				isFirst,
				isLast,
			});

			// Update chunk
			chunkContent = formatted.content;
			addToChunkMap(formatted.map);

			// [4] - Add to bundle
			bundle.addSource({
				filename: asset.source,
				content: chunkContent,
			});

			if (
				chunkSourceMap &&
				sourceMap &&
				textExtensions.includes(asset.extension) &&
				typeof asset.content == "string"
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
				this.addAsset(sourceMapOutputSource, JSON.stringify(sourceMapObject));

				let sourceMapBasename = path.basename(sourceMapOutputSource);

				finalContent += `\n//# sourceMappingURL=${sourceMapBasename}`;
			}
		}

		// [5] - Add core module imports
		let packageJSON = this.assets.get("/package.json");
		let pkg;
		if (packageJSON?.content && typeof packageJSON.content == "string") {
			pkg = JSON.parse(packageJSON.content);
		}

		for (let coreModule of importedCoreModules) {
			// Check package.json for version
			if (pkg?.dependencies && coreModule.parsed.name in pkg.dependencies) {
				let pkgVersion = pkg.dependencies[coreModule.parsed.name];

				// If version is empty, omit the @<version>
				let newImport = !pkgVersion
					? coreModule.parsed.name
					: `${coreModule.parsed.name}@${pkgVersion}`;
				coreModule.imported = coreModule.parsed.name.replace(
					coreModule.parsed.name,
					newImport
				);

				coreModule.usedVersion = pkgVersion;
			}

			let importCode = `import * as ${coreModule.name} from "${
				skypackURL + coreModule.imported
			}";`;

			finalContent = importCode + finalContent;
		}

		// Update package.json
		let coreModulesJSON = importedCoreModules.reduce((acc: any, cur: any) => {
			acc[cur.parsed.name] = cur.usedVersion || cur.parsed.version;
			return acc;
		}, {});

		if (pkg) {
			await this.addAsset(
				"/package.json",
				JSON.stringify(
					Object.assign(pkg, {
						dependencies: {
							...pkg.dependencies,
							...coreModulesJSON,
						},
					})
				)
			);
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
			this.addAsset(entryOutputPath, bundleResult.content);

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

					this.addAsset(resourceOutputPath, bundleResult.content);
				}
			}
		}

		console.log(bundleResult);

		console.timeEnd("Total Bundle Time");

		return bundleResult;
	}
}
