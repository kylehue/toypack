import fs from "fs";
import * as path from "path";
import toypack, { ToypackConfig } from "@toypack/core/ToypackConfig";
import createDependencyGraph from "@toypack/core/dependencyGraph";
import { HTMLLoader, CSSLoader, JSLoader } from "@toypack/loaders";
import MagicString, { Bundle } from "magic-string";
import {
	formatAsset as UMDChunk,
	formatBundle as UMDBundle,
} from "./moduleTemplates/UMD";
import { isURL } from "@toypack/utils";
export { vol } from "memfs";

export const LOADERS: any = [
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

export const CACHED_ASSETS = new Map();

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
	let bundle = new Bundle();

	try {
		let hasLoader = LOADERS.some((ldr: any) => ldr.test.test(entryId));

		if (hasLoader) {
			let graph = await createDependencyGraph(entryId);
			console.log(graph);

			for (let asset of graph) {
				if (/\.(css|html)$/.test(asset.id)) {
					let originalContent = new MagicString(asset.content);
					let chunk: any = asset.loader.compile(originalContent, asset);
					chunk = UMDChunk(chunk, asset);
					
					chunk.append("\n//# sourceMappingURL=" + chunk.generateMap().toUrl());

					bundle.addSource({
						filename: asset.id,
						content: chunk,
					});
				}
			}

			bundle = UMDBundle(bundle, entryId);
			/* console.log(
				bundle.toString()
			); */
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
