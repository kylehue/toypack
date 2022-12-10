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
import { BUNDLE_DEFAULTS, BundleConfig } from "@toypack/core/ToypackConfig";
import { Loader, Asset } from "@toypack/loaders/types";
import { isURL, parsePackageStr } from "@toypack/utils";
import { generateFrom as createSourceMap } from "@toypack/core/SourceMap";
import {
	transformChunk as chunkUMD,
	transformBundle as finalizeUMD,
} from "@toypack/core/moduleDefinitions/UMD";
import MagicString, { Bundle } from "magic-string";
import combine from "combine-source-map";
import convert from "convert-source-map";
import babelMinify from "babel-minify";
import merge from "lodash.merge";
import clonedeep from "lodash.clonedeep";
import { vol } from "memfs";

export const LOADERS: Loader[] = [
	BabelLoader,
	HTMLLoader,
	CSSLoader,
	JSONLoader,
	VueLoader,
];

export const STYLE_EXTENSIONS = [".css", ".sass", ".scss", ".less"];

export const RESOLVE_PRIORITY = [
	".js",
	".ts",
	".json",
	".jsx",
	".tsx",
	".vue",
	".html",
	...STYLE_EXTENSIONS,
];

export const CACHED_ASSETS: Map<string, Asset> = new Map();

const skypackURL = "https://cdn.skypack.dev/";
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
	let type = STYLE_EXTENSIONS.some((sx) => sx === path.extname(options.source)) ? "stylesheet" : "module";

	let data: Asset = {
		id: "",
		type: type as any,
		content: "",
		contentURL: "",
		skippable: type == "stylesheet" || isURL(options.source)
	};

	// Check cache
	let cached = CACHED_ASSETS.get(options.source);
	if (cached && options.content == cached.content) {
		return cached;
	}

	let assetName = path.basename(options.source);
	let targetDir = path.dirname(options.source);

	// If options.source is an external URL, fetch the content then add
	if (isURL(options.source)) {
		if (!cached) {
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

		let assetID = path.join("/", targetDir, assetName);

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

		// If cached, merge cached and new data
		if (cached) {
			CACHED_ASSETS.set(assetID, merge(cached, data));
		} else {
			CACHED_ASSETS.set(assetID, data);
		}
	}

	return data;
}

export function addLoader(loader: Loader) {
	LOADERS.push(loader);
}

export const BUNDLE_CONFIG: BundleConfig = clonedeep(BUNDLE_DEFAULTS);
export function defineBundleConfig(config: BundleConfig) {
	merge(BUNDLE_CONFIG, config);
}

type Bundle = {
	content: string;
	contentURL: string | null;
	contentDocURL: string | null;
};

let prevContentURL: any;
let prevContentDocURL: any;

export async function bundle() {
	console.clear();

	let bundleResult: Bundle = {
		content: "",
		contentURL: null,
		contentDocURL: null,
	};

	try {
		if (
			!ALLOWED_ENTRY_POINTS_PATTERN.test(BUNDLE_CONFIG.entry) &&
			path.extname(BUNDLE_CONFIG.entry)
		) {
			throw new Error(`Invalid entry file: ${BUNDLE_CONFIG.entry}.`);
		}

		let entryId = resolve.sync(BUNDLE_CONFIG.entry, {
			basedir: ".",
			extensions: RESOLVE_PRIORITY,
			includeCoreModules: false,
		});

		let hasLoader = LOADERS.some((ldr: any) => ldr.test.test(entryId));
		if (hasLoader) {
			let graph = await createDependencyGraph(entryId);

			let outputPath = path.join(
				BUNDLE_CONFIG.output.path,
				BUNDLE_CONFIG.output.filename
			);
			let packageJSON: any = CACHED_ASSETS.get("/package.json") || {};

			if (packageJSON?.content) {
				packageJSON = JSON.parse(packageJSON.content);
			}

			let contentBundle = new Bundle();
			let sourceMapBundle = combine.create(BUNDLE_CONFIG.output.filename);
			let coreModulesBundle: any = [];
			let prevContentLine = 0;

			console.log(graph);

			console.time("transformation end");
			for (let asset of graph) {
				// Check cache
				let cached = CACHED_ASSETS.get(asset.id);
				console.time(asset.id);

				// If asset content didn't change
				if (cached?.content === asset.content && cached.compilationData) {
					let content = cached.compilationData.content;
					console.log("%c cached: ", "color: gold;", asset.id);

					// If stylesheet, skip other steps 
					if (asset.type == "stylesheet") {
						contentBundle.addSource({
							filename: asset.id,
							content: new MagicString(content),
						});

						continue;
					}

					// [2] - Core module filtration
					for (let dep of cached.compilationData.coreModules) {
						let exists = coreModulesBundle.some(
							(cm: any) => cm.imported === dep.imported
						);

						if (!exists) {
							coreModulesBundle.push(dep);
						}
					}

					// [4] - Add source map to bundle
					contentBundle.addSource({
						filename: asset.id,
						content: new MagicString(content),
					});

					sourceMapBundle.addFile(
						{
							source: cached.compilationData.map.toComment(),
							sourceFile: asset.id,
						},
						{
							line: prevContentLine,
						}
					);

					// Offset source map
					prevContentLine += content.split("\n").length;

					// Then skip
					continue;
				}

				console.log("%c compiling: ", "color: red;", asset.id);

				// Check if asset has a loader
				if (asset.loader) {
					// [1] - Compile to JS using a loader 🎉
					let compiled = await asset.loader.use.compile(asset.content, asset);

					// Initialize asset content and source map
					let assetContent = compiled.content;
					let assetSourceMap: any = null;

					if (BUNDLE_CONFIG.output.sourceMap && !asset.skippable) {
						assetSourceMap = createSourceMap(compiled.map);
					}

					// [2] - Transform 🎉
					// Transformation handles the transpilation, polyfills, and core module filtration
					let transformed: any = {};

					// Only transform if not skippable
					if (!asset.skippable) {
						transformed = transformAsset(assetContent, asset);
						for (let dep of transformed.coreModules) {
							let exists = coreModulesBundle.some(
								(cm: any) => cm.imported === dep.imported
							);
							if (!exists) {
								coreModulesBundle.push(dep);
							}
						}
					} else {
						transformed.content = assetContent;
					}
					
					// Update asset content
					assetContent = transformed.content;

					// Merge transpiled source map to asset source map
					assetSourceMap?.mergeTo(transformed.map);

					// [3] - Finalize asset chunk with module definitions 🎉
					let moduleDefined = chunkUMD(assetContent, asset);

					// Update asset content
					assetContent = moduleDefined.content;

					// Merge module defined source map to asset source map
					assetSourceMap?.mergeTo(moduleDefined.map);

					// [4] - Add to bundle 🎉
					// Add source map to bundle
					if (assetSourceMap) {
						// Back to original contents
						assetSourceMap.sourcesContent[1] = asset.content;

						// Add source map to bundle
						sourceMapBundle.addFile(
							{
								source: assetSourceMap.toComment(),
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
					let assetData = {
						filename: asset.id,
						content: new MagicString(assetContent),
					};

					contentBundle.addSource(assetData);

					// Cache
					let cacheData = {
						content: assetData.content.toString(),
						map: assetSourceMap,
						coreModules: transformed.coreModules,
					};

					if (cached) {
						cached.compilationData = cacheData;
					}
				} else {
					throw new Error(
						`${asset.id} is not supported. You might want to add a loader for this file type.`
					);
				}

				console.timeEnd(asset.id);
			}

			console.timeEnd("transformation end");

			// [5] - Finalize bundle
			console.time("finalize");
			let UMDBundle = finalizeUMD(contentBundle.toString(), {
				entry: entryId,
				name: BUNDLE_CONFIG.output.name,
			});

			let finalSourceMap = createSourceMap(
				convert.fromBase64(sourceMapBundle.base64()).toObject()
			);

			finalSourceMap.mergeTo(UMDBundle.map);

			// Import the core modules that was extracted during transformation
			let importsBundle = new MagicString(UMDBundle.content);
			for (let coreModule of coreModulesBundle) {
				// Check package.json for version
				if (
					packageJSON?.dependencies &&
					coreModule.parsed.name in packageJSON.dependencies
				) {
					let packageJSONVersion =
						packageJSON.dependencies[coreModule.parsed.name];

					// If version is empty, omit the @<version>
					let newImport = !packageJSONVersion
						? coreModule.parsed.name
						: `${coreModule.parsed.name}@${packageJSONVersion}`;
					coreModule.imported = coreModule.parsed.name.replace(
						coreModule.parsed.name,
						newImport
					);

					coreModule.usedVersion = packageJSONVersion;
				}

				let importCode = `import * as ${coreModule.localId} from "${
					skypackURL + coreModule.imported
				}";\n`;

				importsBundle.prepend(importCode);
			}

			// Update package.json
			let coreModulesJSON = coreModulesBundle.reduce((acc: any, cur: any) => {
				acc[cur.parsed.name] = cur.usedVersion || cur.parsed.version;
				return acc;
			}, {});

			addAsset({
				source: "/package.json",
				content: JSON.stringify(
					Object.assign(packageJSON, {
						dependencies: {
							...packageJSON.dependencies,
							...coreModulesJSON,
						},
					})
				),
			});

			// Finalize content
			finalSourceMap.mergeTo(
				importsBundle.generateMap({
					includeContent: true,
					hires: !BUNDLE_CONFIG.output.optimizeSourceMap,
				})
			);

			let finalContent = importsBundle.toString();

			// Optimizations
			if (BUNDLE_CONFIG.mode == "production") {
				let minified = babelMinify(
					finalContent,
					{
						mangle: {
							topLevel: true,
							keepClassName: true,
						},
					},
					{
						sourceMaps: BUNDLE_CONFIG.output.sourceMap ? true : false,
					}
				);

				finalContent = minified.code;

				if (BUNDLE_CONFIG.output.sourceMap) {
					finalSourceMap.mergeTo(minified.map);
				}
			}

			// Source map type
			if (BUNDLE_CONFIG.output.sourceMap) {
				if (BUNDLE_CONFIG.output.sourceMap === "inline") {
					// Inline source map
					finalContent += finalSourceMap.toComment();
				} else {
					// External source map
					let sourceMapAsset = await addAsset({
						source: outputPath + ".map",
						content: finalSourceMap.toString(),
					});

					finalContent += "\n//# sourceMappingURL=" + sourceMapAsset.id;
				}
			}

			// Out bundle
			await addAsset({
				source: outputPath,
				content: finalContent,
			});

			bundleResult.content = finalContent;

			// Generate output URLs
			if (BUNDLE_CONFIG.output.contentURL) {
				if (prevContentURL) {
					URL.revokeObjectURL(prevContentURL);
				}

				let contentURL = URL.createObjectURL(
					new Blob([finalContent], {
						type: MIME_TYPES[".js"],
					})
				);

				prevContentURL = contentURL;

				// prettier-ignore
				let contentDoc =
			// prettier-ignore
`<!DOCTYPE html>
<html>
	<head>
		<script defer type="module" src="${contentURL}"></script>
	</head>
	<body>
	</body>
</html>
`;
				if (prevContentDocURL) {
					URL.revokeObjectURL(prevContentDocURL);
				}

				let contentDocURL = URL.createObjectURL(
					new Blob([contentDoc], {
						type: MIME_TYPES[".html"],
					})
				);

				prevContentDocURL = contentDocURL;

				bundleResult.contentURL = contentURL;
				bundleResult.contentDocURL = contentDocURL;
				
			}
			
			console.timeEnd("finalize");

			console.log(vol.toJSON(), bundleResult);
		} else {
			throw new Error(
				`${entryId} is not supported. You might want to add a loader for this file type.`
			);
		}
	} catch (error) {
		console.error(error);
	}

	return bundleResult;
}

(window as any).bundle = bundle;

/* type WatchCallback = (bundle: string) => void;

export function watch(callback: WatchCallback) {
	let bundledCode = bundle({
		entry: ""
	});

	callback(bundledCode);
} */
