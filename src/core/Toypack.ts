import fs from "fs";
import * as path from "path";
import toypack, { ToypackConfig } from "@toypack/core/ToypackConfig";
import { Bundle } from "magic-string";
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

interface BundleOptions {
	entry: string;
	sourceMap?: boolean;
	plugins?: Array<Function>;
}

const cache = new Map();
/**
 * @param {BundleOptions} options Bundling configurations.
 */

export async function bundle(options: BundleOptions) {
	let result = new Bundle();
	let entry = options.entry;
	let extname = path.extname(entry);
	let type = extname.substr(1);

	// Get transformer
	/* let transformer;
	if (true) {
		await import(`../transformers/html/HTMLTransformer`);
	} else {
		await import(`../transformers/html/HTMLTransformer`);
	}
	console.log(transformer); */
}

/* type WatchCallback = (bundle: string) => void;

export function watch(callback: WatchCallback) {
	let bundledCode = bundle({
		entry: ""
	});

	callback(bundledCode);
} */
