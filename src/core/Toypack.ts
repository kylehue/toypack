import fs from "fs";
import * as path from "path";
import toypack, { ToypackConfig } from "@toypack/core/ToypackConfig";
import { Bundle } from "magic-string";
import { HTMLParser, CSSParser, JSParser } from "@toypack/parsers";
import { isURL } from "@toypack/utils";
import resolve from "resolve";
export { vol } from "memfs";

const PARSERS: any = {
	html: HTMLParser,
	css: CSSParser,
	js: JSParser,
};

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

const CACHED_EXTERNALS = new Map();

export interface Asset {
	source: string;
	content?: string;
	moduleName?: string;
}

/**
 * @param {Asset} options Configurations for the asset.
 */

export async function addAsset(options: Asset) {
	let assetName = path.basename(options.source);
	let targetDir = path.dirname(options.source);
	let data: any = {};

	// If options.source is an external URL, fetch the content then add
	if (isURL(options.source) && !CACHED_EXTERNALS.get(options.source)) {
		let fetchResponse = await fetch(options.source);

		if (fetchResponse.ok) {
			let content = await fetchResponse.text();

			CACHED_EXTERNALS.set(options.source, content);

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

		data.content = options.content;
		data.source = assetID;
	}

	return data;
}

const CACHED_ASSETS = new Map();
export const RESOLVE_PRIORITY = [".js", ".ts", ".json", ".jsx", ".tsx", ".vue"];

/**
 * @param {string} entryId The entry point of the graph.
 */

function getDependencyGraph(entryId: string) {
	let graph: Array<object> = [];

	function scanModule(moduleId: string) {
		let moduleExtname = path.extname(moduleId);
		let moduleType = moduleExtname.substr(1);
		
		try {
			// If module is external URL
			if (isURL(moduleId)) {
				// Add to assets if not in cache
				if (!CACHED_EXTERNALS.get(moduleId)) {
					addAsset({
						source: moduleId,
					}).then((asset) => {
						graph.push({
							id: asset.source,
							content: asset.content,
						});
					});
				} else {
					graph.push({
						id: moduleId,
						content: CACHED_EXTERNALS.get(moduleId),
					});
				}
			} else {
				// Get module contents
				let moduleContent = fs.readFileSync(moduleId, "utf-8");
				if (moduleContent) {
					// Get parser
					let parser = PARSERS[moduleType];
					if (parser) {
						let moduleData = parser.parse(moduleContent);

						// Add to graph
						graph.push({
							id: moduleId,
							data: moduleData,
							content: moduleContent,
						});

						// Add to cache
						// CACHED_ASSETS.set(moduleId, {
						// 	content: moduleContent,
						// 	data: moduleData,
						// });

						// Scan dependencies
						for (let dependency of moduleData.dependencies) {
							let dependencyAbsolutePath: any = undefined;

							if (isURL(dependency)) {
								dependencyAbsolutePath = dependency;
							} else {
								dependencyAbsolutePath = resolve.sync(dependency, {
									basedir: path.dirname(moduleId),
									extensions: RESOLVE_PRIORITY,
								});
							}

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
			}
		} catch (error) {
			console.error(error);
		}
	}

	// Scan recursively for dependencies
	scanModule(path.join("/", entryId));

	return graph;
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
	try {
		// If the entry is an html file, the script tags in it will serve as the entry points
		if (entryType == "html") {
			// Get file contents
			let entryContent = fs.readFileSync(entryId, "utf-8");
			if (entryContent) {
				// Parse
				let entryData = HTMLParser.parse(entryContent);

				// Get dependency graph of each dependency
				for (let dependency of entryData.dependencies) {
					let graph = getDependencyGraph(dependency);
				}
			}
		} else {
			// If the entry is a script e.g. jsx or vue, get its dependency graph
			let graph = getDependencyGraph(entryId);
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
