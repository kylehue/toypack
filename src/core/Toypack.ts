import {
	ResolveOptions,
	ToypackOptions,
	AssetInterface,
	Loader,
	ParsedAsset,
} from "@toypack/core/types";
import { BabelLoader, JSONLoader } from "@toypack/loaders";
import { defaultOptions } from "@toypack/core/options";

import merge from "lodash.merge";
import { isURL, getBtoa, isLocal } from "@toypack/utils";
import * as path from "path";
import mime from "mime-types";
import { SourceMapData } from "./SourceMap";

const styleExtensions = [".css", ".sass", ".scss", ".less"];
const appExtensions = [".js", ".json", ".jsx", ".ts", ".tsx", ".html", ".vue"];
const textExtensions = [...appExtensions, ...styleExtensions];

export default class Toypack {
	public assets: Map<string, AssetInterface> = new Map();
	public options: ToypackOptions = defaultOptions;
	public loaders: Loader[] = [];
	private _lastId: number = 0;
	private _graphCache: Map<string, AssetInterface> = new Map();

	constructor(options?: ToypackOptions) {
		if (options) {
			merge(this.options, options);
		}

		this.addLoader(new BabelLoader());
		this.addLoader(new JSONLoader());
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

	private _createAsset(source: string, content: string | ArrayBuffer) {
		let id = ++this._lastId;
		let type = mime.lookup(source) || "";
		let extension = path.extname(source);

		let loader = this._getLoader(source);

		if (!loader) {
			throw new Error(
				`Asset Error: ${source} is not supported. You might want to add a loader for this file type.`
			);
		}

		let asset: AssetInterface = {
			id,
			source,
			content,
			type,
			extension,
			loader,
			loaderData: {
				parse: {
					dependencies: []
				},
				compile: {
					content: "",
					map: {} as SourceMapData
				}
			},
			dependencyMap: {}
		};

		return asset;
	}

	private async _createURL(blob: Blob, content?: string | ArrayBuffer) {
		let url: string = "";
		if (this.options.bundleOptions.mode == "production") {
			content = content ? content : await blob.text();
			let base64 = getBtoa(content);
			url = `data:${blob.type};base64,${base64}`;
		} else {
			url = URL.createObjectURL(blob);
		}

		return url;
	}

	public async addAsset(source: string, content: string | ArrayBuffer = "") {
		let cached = this.assets.get(source);
		let isExternal = isURL(source);
		source = isExternal ? source : path.join("/", source);

		if (cached?.content === content) {
			return cached;
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

		// Create blob and content URLs if needed
		if (this.options.bundleOptions.output.contentURL) {
			asset.blob = new Blob([asset.content], {
				type: asset.type,
			});

			// Revoke previous URL
			if (cached?.contentURL?.startsWith("blob:")) {
				URL.revokeObjectURL(cached?.contentURL);
			}

			asset.contentURL = await this._createURL(asset.blob, asset.content);
		}

		this.assets.set(source, asset);

		return asset;
	}

	public resolve(x: string, options?: ResolveOptions) {
		if (typeof x !== "string") {
			throw new TypeError("Path must be a string.");
		}

		const opts = Object.assign(
			{
				extensions: textExtensions,
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
				

			return false;
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
		let cached = this._graphCache.get(source);

		if (asset) {
			if (isExternal || typeof asset.content != "string") {
				graph.push(asset);
			} else {
				if (typeof asset.loader.parse != "function") {
					graph.push(asset);
					return;
				}

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
							extensions: textExtensions,
							includeCoreModules: false
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
		} else {
			throw new Error(`Graph Error: Cannot find asset ${source}.`);
		}

		return graph;
	}

	public async bundle() {
		let entrySource = this.resolve(
			path.join("/", this.options.bundleOptions.entry)
		);

		if (!entrySource) {
			return;
		}

		let graph = await this._createGraph(entrySource);
		console.log(graph);
	}
}
