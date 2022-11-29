import fs from "fs";
import * as path from "path";
import toypack, { ToypackConfig } from "toypack/core/ToypackConfig";
import resolve from "toypack/resolver";
export { default as resolve } from "toypack/resolver";
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

export interface AssetOptions {
	moduleName?: string;
}
/**
 *
 * @param {string} src The source of the asset.
 * @param {string} content The contents of the asset.
 * @param {AssetOptions} options Optional configurations for the asset.
 */

export function addAsset(src: string, content: string, options?: AssetOptions) {
	let assetName = path.basename(src);
	let targetDir = path.dirname(src);

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
	fs.writeFileSync(assetID, content);
}

interface BundleOptions {
	entry: string;
	sourceMap?: boolean;
	plugins?: Array<Function>;
}

/**
 * @param {BundleOptions} options Bundling configurations.
 */

export function bundle(options: BundleOptions): string {
	return "";
}
