import fs from "fs";
import * as path from "path";
import resolve from "resolve";
import toypack, { ToypackConfig } from "@toypack/core/ToypackConfig";
import createDependencyGraph from "@toypack/core/dependencyGraph";
import { HTMLLoader, CSSLoader, JSLoader } from "@toypack/loaders";
import MagicString, { Bundle } from "magic-string";
import convertSourceMap from "convert-source-map";
import combineSourceMap from "combine-source-map";
import mergeSourceMap from "merge-source-map";
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

interface SourceMap {
	/**
	 * The filename where you plan to write the sourcemap.
	 */
	file?: string;
	/**
	 * The filename of the file containing the original source.
	 */
	source?: string;
	/**
	 * Whether to include the original content in the map's `sourcesContent` array.
	 */
	includeContent?: boolean;
	/**
	 * Whether the mapping should be high-resolution. Hi-res mappings map every single character, meaning (for example) your devtools will always be able to pinpoint the exact location of function calls and so on. With lo-res mappings, devtools may only be able to identify the correct line - but they're quicker to generate and less bulky.
	 */
	hires?: boolean;
}

interface OutputOptions {
	path: string;
	filename: string;
	type?: "umd";
	sourceMap?: SourceMap;
}

interface BundleOptions {
	entry: string;
	output: OutputOptions;
	plugins?: Array<Function>;
}

/**
 * @param {BundleOptions} options Bundling configurations.
 */

export async function bundle(options: BundleOptions) {
	let bundle = new Bundle();

	try {
		let entryId = resolve.sync(options.entry, {
			basedir: ".",
			extensions: RESOLVE_PRIORITY,
			includeCoreModules: false,
		});

		let hasLoader = LOADERS.some((ldr: any) => ldr.test.test(entryId));

		if (hasLoader) {
			let graph = await createDependencyGraph(entryId);
			console.log(graph);

			let outputPath = path.join(options.output.path, options.output.filename);
			let remaps: any = {};
			for (let asset of graph) {
				if (/\.(css|html|js)$/.test(asset.id)) {
					let originalContent = new MagicString(asset.content);
					let chunk: any = asset.loader.compile(originalContent, asset);
					let processedChunk = UMDChunk(chunk, asset);

					bundle.addSource({
						filename: asset.id,
						content: processedChunk.content,
					});

					if (processedChunk.map) {
						remaps[asset.id] = processedChunk.map;
					}
				}
			}
			
			bundle = UMDBundle(bundle, entryId);

			let map = bundle.generateMap({
				file: outputPath,
				includeContent: true,
				hires: true,
			});

			// TODO: Merge source maps from babel-transpiled chunks

			console.log(map);
			

			for (let remap of Object.values(remaps)) {
				console.log(mergeSourceMap(map, remap));
				
			}

			bundle.append("\n//# sourceMappingURL=" + map.toUrl());
			
			addAsset({
				source: outputPath,
				content: bundle.toString(),
			});

			console.log(fs.readFileSync(outputPath, "utf-8"));

			console.log(remaps);
			
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
