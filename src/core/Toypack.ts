import fs from "fs";
import * as path from "path";
import toypack, { ToypackConfig } from "@toypack/core/ToypackConfig";
import MagicString, { Bundle } from "magic-string";
import { HTMLLoader, CSSLoader, JSLoader } from "@toypack/loaders";
import { Asset } from "@toypack/loaders/types";
import { isURL } from "@toypack/utils";
import resolve from "resolve";
export { vol } from "memfs";

const LOADERS: any = [
	{
		test: /\.html$/,
		use: HTMLLoader,
	},
	{
		test: /\.css$/,
		use: CSSLoader,
	},
	{
		test: /\.js$/,
		use: JSLoader,
	},
];

/**
 *
 * @param {ToypackConfig} config Toypack configurations.
 */

export function defineConfig(config: ToypackConfig) {
	for (let [key, value] of Object.entries(config)) {
		if (toypack[key]) {
			toypack[key] = value;
		} else {
			console.warn(`Unknown config "${key}"`);
		}
	}
}

const CACHED_ASSETS = new Map();

export interface AssetOptions {
	source: string;
	content?: string;
	moduleName?: string;
}

interface AssetData {
	source: string;
	content: string;
}

/**
 * @param {AssetOptions} options Configurations for the asset.
 */

export async function addAsset(options: AssetOptions) {
	let data: AssetData = {
		source: "",
		content: "",
	};

	// Check cache
	let cached = CACHED_ASSETS.get(options.source);
	if (cached && options.content == cached.content) {
		data.source = cached.id;
		data.content = cached.content;
		return data;
	}

	let assetName = path.basename(options.source);
	let targetDir = path.dirname(options.source);

	// If options.source is an external URL, fetch the content then add
	if (isURL(options.source) && !CACHED_ASSETS.get(options.source)) {
		let fetchResponse = await fetch(options.source);

		if (fetchResponse.ok) {
			let content = await fetchResponse.text();

			CACHED_ASSETS.set(options.source, content);

			data.content = content;
			data.source = options.source;
		}
	} else {
		// If module name is indicated, put it inside `node_modules`
		if (options?.moduleName) {
			targetDir = path.join(
				toypack.coreModuleBase,
				options.moduleName || "",
				targetDir
			);
		}

		let assetID = path.join(targetDir, assetName);

		fs.mkdirSync(targetDir, { recursive: true });
		fs.writeFileSync(assetID, options.content || "");

		data.content = options.content || "";
		data.source = assetID;

		CACHED_ASSETS.set(assetID, {
			content: data.content,
			data: [],
			id: assetID,
		});
	}

	return data;
}

export const RESOLVE_PRIORITY = [".js", ".ts", ".json", ".jsx", ".tsx", ".vue"];

/**
 * @param {string} entryId The entry point of the graph.
 */

async function getDependencyGraph(entryId: string) {
	let graph: Array<Asset> = [];

	async function scanModule(moduleId: string) {
		let moduleExtname = path.extname(moduleId);
		let moduleContent: any = null;
		let cached = CACHED_ASSETS.get(moduleId);
		try {
			// [1] - Get module contents
			// If module id is an external URL, check cache
			if (isURL(moduleId)) {
				// Add to assets if not in cache
				if (!cached) {
					let asset = await addAsset({
						source: moduleId,
					});

					moduleContent = asset.content;
				} else {
					moduleContent = cached.content;
				}
			} else {
				moduleContent = fs.readFileSync(moduleId, "utf-8");
			}

			if (moduleContent) {
				// [2] - Get loader and parse the module content so we can get its dependencies
				const LOADER = LOADERS.find((ldr: any) => ldr.test.test(moduleId));
				if (LOADER) {
					let moduleData: any = null;

					// Avoid parsing if the module content and the cached content is still equal
					if (cached && cached.content == moduleContent) {
						moduleData = cached.data;
					} else {
						moduleData = LOADER.use.parse(moduleContent);
					}

					// [3] - Add module to graph along with its parsed data
					// Instantiate asset
					const ASSET: Asset = {
						id: moduleId,
						data: moduleData,
						content: moduleContent,
						loader: LOADER.use,
					};

					// Add to graph
					graph.push(ASSET);

					// Add to cache
					CACHED_ASSETS.set(moduleId, ASSET);

					// [4] - Scan the module's dependencies
					for (let dependency of moduleData.dependencies) {
						let dependencyAbsolutePath: any = null;

						// Only resolve if not a URL
						if (!isURL(dependency)) {
							dependencyAbsolutePath = resolve.sync(dependency, {
								basedir: path.dirname(moduleId),
								extensions: RESOLVE_PRIORITY,
							});
						} else {
							dependencyAbsolutePath = dependency;
						}

						// Check if it exists in the graph already before scanning to avoid duplicates
						// Scanning is also adding because we're in a recursive function
						let isScanned = graph.some(
							(p: any) => p.id == dependencyAbsolutePath
						);

						if (!isScanned) {
							scanModule(dependencyAbsolutePath);
						}
					}
				} else {
					throw new Error(`${moduleExtname} files are not yet supported.`);
				}
			}
		} catch (error) {
			console.error(error);
		}
	}

	// Scan recursively for dependencies
	await scanModule(path.join("/", entryId));

	return graph;
}

interface Loader {
	test: RegExp;
	use: object;
}

export function addLoader(loader: Loader) {
	LOADERS.push(loader);
}

interface BundleOptions {
	entry: string;
	sourceMap?: boolean;
	plugins?: Array<Function>;
	outdir?: string;
}

/**
 * @param {BundleOptions} options Bundling configurations.
 */

export async function bundle(options: BundleOptions) {
	let entryId = options.entry;
	let entryExtname = path.extname(entryId);
	let entryType = entryExtname.substr(1);
	let bundle = new Bundle();

	try {
		let hasLoader = LOADERS.some((ldr: any) => ldr.test.test(entryId));

		if (hasLoader) {
			let graph = await getDependencyGraph(entryId);
			console.log(graph);

			for (let asset of graph) {
				if (/\.(css|html)$/.test(asset.id)) {
					let originalContent = new MagicString(asset.content);
					let compiledContent = asset.loader.compile(originalContent, asset);

					bundle.addSource({
						filename: asset.id,
						content: compiledContent,
					});
				}
			}
		} else {
			throw new Error(
				`${entryId} is not supported. You might want to add a loader for this file type.`
			);
		}
	} catch (error) {
		console.error(error);
	}
}

/* type WatchCallback = (bundle: string) => void;

export function watch(callback: WatchCallback) {
	let bundledCode = bundle({
		entry: ""
	});

	callback(bundledCode);
} */
