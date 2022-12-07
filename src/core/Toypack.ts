import fs from "fs";
import * as path from "path";
import resolve from "resolve";
import toypack, { ToypackConfig } from "@toypack/core/ToypackConfig";
import createDependencyGraph from "@toypack/core/dependencyGraph";
import { HTMLLoader, CSSLoader, BabelLoader } from "@toypack/loaders";
import { ALLOWED_ENTRY_POINTS_PATTERN } from "@toypack/core/globals";
import { Loader } from "@toypack/loaders/types";
import { generateFrom, merge } from "@toypack/core/SourceMap";
import MagicString, { Bundle } from "magic-string";
import combine from "combine-source-map";
import convert from "convert-source-map";
import {
	formatAsset as UMDChunk,
	formatBundle as UMDBundle,
} from "./moduleTemplates/UMD";
import { isURL } from "@toypack/utils";
export { vol } from "memfs";

export const LOADERS: Loader[] = [BabelLoader, HTMLLoader, CSSLoader];

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

import {
	transform as babelTransform,
	availablePlugins,
} from "@babel/standalone";

/**
 * @param {BundleOptions} options Bundling configurations.
 */

export async function bundle(options: BundleOptions) {
	try {
		if (!ALLOWED_ENTRY_POINTS_PATTERN.test(options.entry)) {
			throw new Error(`Invalid entry file: ${options.entry}.`);
		}

		let entryId = resolve.sync(options.entry, {
			basedir: ".",
			extensions: RESOLVE_PRIORITY,
			includeCoreModules: false,
		});

		let hasLoader = LOADERS.some((ldr: any) => ldr.test.test(entryId));
		if (hasLoader) {
			let graph = await createDependencyGraph(entryId);
			let outputPath = path.join(options.output.path, options.output.filename);

			let contentBundle = new Bundle();
			let sourceMapBundle = combine.create("bundle.js");
			let prevContentLine = 0;
			// Possible problem #1 - sources don't match sometimes e.g. original source is /styles/main.css and the generated source is /main.css
			for (let asset of graph) {
				if (/\.(css|html|js)$/.test(asset.id)) {
					// [1] - Compile to JS using a loader 🎉
					let compiled = await asset.loader.use.compile(asset.content, asset);

					// Initialize asset content and source map
					let assetContent = compiled.content;
					let assetSourceMap = generateFrom(compiled.map);
					
					// [2] - Transpile 🎉
					// Ensure that the asset's loader is not BabelLoader
					// so that we don't transpile assets twice
					if (asset.loader.name != "BabelLoader") {
						let transpiled = babelTransform(compiled.content, {
							presets: ["es2015-loose"],
							compact: true,
							sourceMaps: true,
							sourceFileName: asset.id,
							sourceType: "module",
						});

						// Update asset content
						assetContent = transpiled.code;

						// Merge transpiled source map to asset source map
						assetSourceMap = merge(assetSourceMap, transpiled.map);

					}

					// [3] - Finalize asset chunk with module definitions 🎉
					let moduleDefined = UMDChunk(assetContent, asset);

					// Update asset content
					assetContent = moduleDefined.content;

					// Merge module defined source map to asset source map
					assetSourceMap = merge(assetSourceMap, moduleDefined.map);


					// [4] - Add to bundle 😩
					// TODO: Find a better solution
					//	Current solution: We had to clone the current source map and bring back its second source content (why second?) back to asset's original code to prevent to source map bundler from referencing the compiled code in browser's devtools.

					// Clone
					let originalMappings = generateFrom(assetSourceMap);

					// Back to original contents
					originalMappings.sourcesContent[1] = asset.content;
					
					// Add source map to bundle
					sourceMapBundle.addFile(
						{
							source: originalMappings.toComment(),
							sourceFile: asset.id,
						},
						{
							line: prevContentLine,
						}
					);
					
					// Offset
					prevContentLine += assetContent.split("\n").length;
					
					// Add contents to bundle
					contentBundle.addSource({
						filename: asset.id,
						content: new MagicString(assetContent),
					});
				}
			}

			let finalBundle = UMDBundle(contentBundle.toString(), entryId);

			let finalSourceMap = merge(
				convert.fromBase64(sourceMapBundle.base64()).toObject(),
				finalBundle.map
			);

			console.log(finalBundle.content + finalSourceMap.toComment());
			console.log(finalSourceMap);
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
