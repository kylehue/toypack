import fs from "fs";
import * as path from "path";
import toypack, { ToypackConfig } from "@toypack/core/ToypackConfig";
import { Bundle } from "magic-string";
import { getParser } from "@toypack/utils";
import resolve from "resolve";
export { vol } from "memfs";
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

export interface Asset {
	source: string;
	content: string;
	moduleName?: string;
}

/**
 * @param {Asset} options Configurations for the asset.
 */

export function addAsset(options: Asset) {
	let assetName = path.basename(options.source);
	let targetDir = path.dirname(options.source);

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
	fs.writeFileSync(assetID, options.content);
}

const CACHED_FILES = new Map();
export const FILE_PRIORITY = [".js", ".json", ".vue", ".jsx"];

/**
 * @param {string} entryId The entry point of the graph.
 */

async function getDependencyGraph(entryId: string) {
	let graph: Array<object> = [];

	async function getFileData(moduleId: string) {
		let moduleExtname = path.extname(moduleId);
		let moduleType = moduleExtname.substr(1);

		try {
			// Get module contents
			let moduleContent = fs.readFileSync(moduleId, "utf-8");
			if (moduleContent) {
				// Get parser
				let parser = await getParser(moduleType);
				if (parser) {
					let moduleData = await parser.parse(moduleContent);

					// Add to graph
					graph.push({
						id: moduleId,
						data: moduleData,
						content: moduleContent
					});

					for (let dependency of moduleData.dependencies) {
						/* let dependencyAbsolutePath = resolve.sync(dependency, {
							basedir: path.dirname(moduleId),
							extensions: FILE_PRIORITY
						});

						console.log(dependencyAbsolutePath);
						
						await getFileData(dependencyAbsolutePath); */
					}
					/* // Add to cache
				CACHED_FILES.set(moduleId, {
					content: moduleContent,
					data: moduleData
				}); */
				} else {
					throw new Error(`${moduleExtname} files are not yet supported.`);
				}
			}
		} catch (error) {
			console.error(error);
		}
		// Get parser and get dependencies
		// Add dependencies' dependencies to graph
	}
	
	await getFileData(entryId);

	console.log(graph);
	
}

interface BundleOptions {
	entry: string;
	sourceMap?: boolean;
	plugins?: Array<Function>;
	outdir?: string;
}

const cache = new Map();

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
				let parser = await getParser("html");
				let entryData = await parser.parse(entryContent);
				
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
