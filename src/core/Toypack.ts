import fs from "fs";
import * as path from "path";
import resolve from "resolve";
import createDependencyGraph from "@toypack/core/dependencyGraph";
import transformAsset from "@toypack/core/transformAsset";
import {
	HTMLLoader,
	CSSLoader,
	BabelLoader,
	JSONLoader,
	VueLoader,
} from "@toypack/loaders";
import {
	ALLOWED_ENTRY_POINTS_PATTERN,
	MIME_TYPES,
} from "@toypack/core/globals";
import { Loader, Asset } from "@toypack/loaders/types";
import { cleanStr, isLocal, isURL } from "@toypack/utils";
import {
	generateFrom as createSourceMap
} from "@toypack/core/SourceMap";
import {
	transformChunk as UMDChunk,
	transformBundle as UMDBundle,
} from "@toypack/core/moduleDefinitions/UMD";
import MagicString, { Bundle } from "magic-string";
import combine from "combine-source-map";
import convert from "convert-source-map";

export const LOADERS: Loader[] = [
	BabelLoader,
	HTMLLoader,
	CSSLoader,
	JSONLoader,
	VueLoader,
];

export const CACHED_ASSETS: Map<string, Asset> = new Map();

(window as any).cache = CACHED_ASSETS;

export interface AssetOptions {
	source: string;
	content?: string;
	moduleName?: string;
}

/**
 * @param {AssetOptions} options Configurations for the asset.
 */

export async function addAsset(options: AssetOptions) {
	let data: Asset = {
		id: "",
		content: "",
		contentURL: "",
	};

	// Check cache
	let cached = CACHED_ASSETS.get(options.source);
	if (cached && options.content == cached.content) {
		data = Object.assign(data, cached);
		return data;
	}

	let assetName = path.basename(options.source);
	let targetDir = path.dirname(options.source);

	// If options.source is an external URL, fetch the content then add
	if (isURL(options.source) && !CACHED_ASSETS.get(options.source)) {
		let fetchResponse = await fetch(options.source);

		if (fetchResponse.ok) {
			let content = await fetchResponse.text();
			data.id = options.source;
			data.content = content;
			data.contentURL = URL.createObjectURL(
				new Blob([content], {
					type: MIME_TYPES[path.extname(options.source)],
				})
			);

			CACHED_ASSETS.set(options.source, data);
		} else {
			console.error("Add Asset Error: Failed to fetch " + options.source);
		}
	} else {
		// If module name is indicated, put it inside `node_modules`
		if (options?.moduleName) {
			targetDir = path.join(
				"node_modules",
				options.moduleName || "",
				targetDir
			);
		}

		let assetID = path.join(targetDir, assetName);

		fs.mkdirSync(targetDir, { recursive: true });
		fs.writeFileSync(assetID, options.content || "");

		data.id = assetID;
		data.content = options.content || "";

		// Revoke previous url if it exists
		if (cached?.contentURL) {
			URL.revokeObjectURL(cached.contentURL);
		}

		data.contentURL = URL.createObjectURL(
			new Blob([data.content], {
				type: MIME_TYPES[path.extname(options.source)],
			})
		);

		CACHED_ASSETS.set(assetID, data);
	}

	return data;
}

export const RESOLVE_PRIORITY = [".js", ".ts", ".json", ".jsx", ".tsx", ".vue"];

export function addLoader(loader: Loader) {
	LOADERS.push(loader);
}

import { getDependency } from "./npm";

export async function addDependency(name: string, version = "latest") {
	let dependency = await getDependency(name, version);
	console.log(dependency);
	if (!dependency) return;

	for (let file of dependency.files) {
		if (!file.name || !path.extname(file.name)) continue;

		await addAsset({
			moduleName: dependency.name,
			source: file.name,
			content: await file.blob.text(),
		});
	}

	if (dependency.package.dependencies) {
		for (let [pkgDependency, pkgDependencyVersion] of Object.entries(
			dependency.package.dependencies
		)) {
			await addDependency(pkgDependency, pkgDependencyVersion as string);
		}
	}
}

interface OutputOptions {
	path: string;
	filename: string;
	type?: "umd";
	sourceMap?: boolean | "inline";

	/**
	 * The name of your library.
	 */
	name?: string;
}

interface BundleOptions {
	mode?: "development" | "production";
	entry: string;
	output: OutputOptions;
	plugins?: Array<Function>;
}

/**
 * @param {BundleOptions} options Bundling configurations.
 */
import { vol } from "memfs";
import {
	BABEL_PARSE_DEFAULTS,
	BUNDLE_DEFAULTS,
} from "@toypack/core/ToypackConfig";
import babelMinify from "babel-minify";
import polyfill, { POLYFILLS } from "@toypack/core/polyfill";
export async function bundle(options: BundleOptions) {
	console.clear();

	options = Object.assign(BUNDLE_DEFAULTS, options);

	// for (let poly of Object.values(POLYFILLS)) {
	// 	if (typeof poly === "object") {
	// 		await addDependency((poly as any).package);
	// 	} else {
	// 		await addDependency(poly as string);
	// 	}
	// }

	await addDependency("canvas-confetti");
	// await addDependency("uuid");
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

			for (let asset of graph) {
				// Check if asset has a loader
				if (asset.loader) {
					// [1] - Compile to JS using a loader 🎉
					let compiled = await asset.loader.use.compile(asset.content, asset);

					// Initialize asset content and source map
					let assetContent = compiled.content;
					let assetSourceMap: any = null;
					if (options.output.sourceMap) {
						assetSourceMap = createSourceMap(compiled.map);
					}

					// [2] - Transform 🎉
					// Transformation handles the transpilation, polyfills, and core module resolution
					let transformed = transformAsset(assetContent, asset);

					// Update asset content
					assetContent = transformed.content;

					// Merge transpiled source map to asset source map
					if (options.output.sourceMap) {
						assetSourceMap.mergeTo(transformed.map);
					}

					// [4] - Finalize asset chunk with module definitions 🎉
					let moduleDefined = UMDChunk(assetContent, asset);

					// Update asset content
					assetContent = moduleDefined.content;

					// Merge module defined source map to asset source map
					if (options.output.sourceMap) {
						assetSourceMap.mergeTo(moduleDefined.map);
					}

					// [5] - Add to bundle 🎉
					// Add source map to bundle
					if (options.output.sourceMap) {
						//	We have to clone the current chunk's source map and bring back its second source content back to asset's original code to prevent the source map combiner from referencing the compiled code in browser's devtools.

						// Clone
						let originalMappings = createSourceMap(assetSourceMap);

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

						// Offset source map
						prevContentLine += assetContent.split("\n").length;
					}

					// Add contents to bundle
					contentBundle.addSource({
						filename: asset.id,
						content: new MagicString(assetContent),
					});
				} else {
					throw new Error(
						`${asset.id} is not supported. You might want to add a loader for this file type.`
					);
				}
			}

			// Finalize bundle
			let finalBundle = UMDBundle(contentBundle.toString(), {
				entry: entryId,
				name: options.output.name,
			});

			let finalSourceMap = createSourceMap(
				convert.fromBase64(sourceMapBundle.base64()).toObject()
			);

			finalSourceMap.mergeTo(finalBundle.map);

			// Optimizations
			if (options.mode == "production") {
				let minified = babelMinify(
					finalBundle.content,
					{
						mangle: {
							topLevel: true,
							keepClassName: true,
						},
					},
					{
						sourceMaps: options.output.sourceMap ? true : false,
					}
				);

				finalBundle.content = minified.code;

				if (options.output.sourceMap) {
					finalSourceMap.mergeTo(minified.map);
				}
			}

			// Source map type
			if (options.output.sourceMap) {
				if (options.output.sourceMap === "inline") {
					// Inline source map
					finalBundle.content += finalSourceMap.toComment();
				} else {
					// External source map
					let sourceMapAsset = await addAsset({
						source: outputPath + ".map",
						content: finalSourceMap.toString(),
					});

					finalBundle.content += "\n//# sourceMappingURL=" + sourceMapAsset.id;
				}
			}

			// Out bundle
			await addAsset({
				source: outputPath,
				content: finalBundle.content,
			});

			console.log(vol.toJSON());
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
