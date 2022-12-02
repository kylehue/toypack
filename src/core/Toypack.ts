import fs from "fs";
import * as path from "path";
import toypack, { ToypackConfig } from "@toypack/core/ToypackConfig";
import { Bundle } from "magic-string";
import { getParser } from "@toypack/utils";
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

function bundleScript(scripts: Array<Asset>) {}

async function getDependencyGraph(entryId: string) {
	const entryExtname = path.extname(entryId);
	const entryType = entryExtname.substr(1);
	// TODO: What if it's a vue or jsx file? How should we get the dependency graph?
	if (entryType != "js") {
		console.error("Entry must be a javascript file.");
		return;
	}

	const graph: Array<string> = [];
	try {
		// Get entry contents
		let entryContent = fs.readFileSync(entryId, "utf-8");
		if (entryContent) {
			// Parse
			let parser = await getParser("js");
		}
	} catch (error) {
		console.error(error);
	}
	// Get parser and get dependencies
	// Add dependencies' dependencies to graph
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
	const entryId = options.entry;
	const entryExtname = path.extname(entryId);
	const entryType = entryExtname.substr(1);

	try {
		// If the entry is an html file, the script tags in it will serve as the entry points
		if (entryType == "html") {
			// Get file contents
			let entryContent = fs.readFileSync(entryId, "utf-8");
			if (entryContent) {
				// Parse
				let parser = await getParser(entryType);
				let entryData = parser.parse(entryContent);

				// Get dependency graph of each script
				for (let script of entryData.scripts) {
					let graph = getDependencyGraph(script);
				}
			}
		} else if (entryType == "js") {
			// If the entry is a js file, get its dependency graph
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
