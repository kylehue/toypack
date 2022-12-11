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
	AssetLoader,
} from "@toypack/loaders";
import {
	ALLOWED_ENTRY_POINTS_PATTERN,
	MIME_TYPES,
} from "@toypack/core/globals";
import { BUNDLE_DEFAULTS, BundleConfig } from "@toypack/core/ToypackConfig";
import { Loader, Asset } from "@toypack/loaders/types";
import { isURL, parsePackageStr } from "@toypack/utils";
import { createSourceMap, SourceMapData } from "@toypack/core/SourceMap";
import {
	transformChunk as chunkUMD,
	transformBundle as finalizeUMD,
} from "@toypack/core/moduleDefinitions/UMD";
import MagicString, { Bundle } from "magic-string";
import combine from "combine-source-map";
import convert from "convert-source-map";
import babelMinify from "babel-minify";
import merge from "lodash.merge";
import cloneDeep from "lodash.clonedeep";
import { vol } from "memfs";
import asset from "@toypack/loaders/asset";

export const LOADERS: Loader[] = [
	BabelLoader,
	HTMLLoader,
	CSSLoader,
	JSONLoader,
	VueLoader,
	AssetLoader,
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
(window as any).assets = CACHED_ASSETS;
(window as any).vol = vol;

let _lastID = 0;

/**
 * @param {AssetOptions} options Configurations for the asset.
 */

export async function addAsset(source: string, content?: string | Uint8Array) {
	let isExternal = isURL(source);
	let assetSource = isExternal ? source : path.join("/", source);

	// If cached asset and new content is the same, just return the cached asset
	let cachedAsset = CACHED_ASSETS.get(assetSource);
	if (cachedAsset && content == cachedAsset.content) {
		console.log(cachedAsset);

		return cachedAsset;
	}

	// Check if there's a loader available for this asset type
	let loader = LOADERS.find((ldr) => ldr.test.test(source));
	if (!loader) {
		throw new Error(
			`Add Asset Error: ${source} is not supported. You might want to add a loader for this file type.`
		);
	}

	// Instantiate Asset
	let fileExtension = path.extname(source);
	let assetId = cachedAsset ? cachedAsset.id : ++_lastID;
	let assetType = MIME_TYPES[fileExtension];
	let asset: Asset = {
		id: assetId,
		type: assetType || "",
		content: content || "",
		source: assetSource,
		loader,
		blob: new Blob([content || ""], {
			type: assetType,
		}),
	};

	// If URL, fetch contents
	if (isExternal && !cachedAsset) {
		let fetchResponse = await fetch(source);
		let blob = await fetchResponse.blob();
		let URLContent: any;
		if (
			asset.type.startsWith("application/") ||
			asset.type.startsWith("text/")
		) {
			URLContent = await blob.text();
		} else {
			URLContent = new Uint8Array(await blob.arrayBuffer());
		}

		asset.blob = blob;
		asset.content = URLContent;
	}

	let assetDirectory = path.dirname(asset.source);
	fs.mkdirSync(assetDirectory, { recursive: true });
	fs.writeFileSync(asset.source, asset.content || "");

	// Content URL
	if (asset?.contentURL) {
		URL.revokeObjectURL(asset.contentURL);
	}

	asset.contentURL = URL.createObjectURL(asset.blob);

	// Caching
	if (cachedAsset) {
		CACHED_ASSETS.set(asset.source, merge(cachedAsset, asset));
	} else {
		CACHED_ASSETS.set(asset.source, asset);
	}

	return asset;
}

/* 
export async function addAsset(options: AssetOptions) {
	let type = STYLE_EXTENSIONS.some((sx) => sx === path.extname(options.source)) ? "stylesheet" : "module";
	let loader = LOADERS.find((ldr) => ldr.test.test(options.source));

	if (!loader) {
		throw new Error(`Add Asset Error: ${options.source} is not supported. You might want to add a loader for this file type.`);
	}

	let asset: Asset = {
		id: ++_lastID,
		source: options.source,
		type: type as any,
		content: options.content || "",
		contentURL: "",
		skippable: type == "stylesheet" || isURL(options.source),
		loader,
	};

	// Check cache
	let cached = ASSETS.get(options.source);
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
				asset.content = content;
				asset.contentURL = URL.createObjectURL(
					new Blob([content], {
						type: MIME_TYPES[path.extname(options.source)],
					})
				);

				ASSETS.set(options.source, asset);
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

		let assetAbsolutePath = path.join("/", targetDir, assetName);

		fs.mkdirSync(targetDir, { recursive: true });
		fs.writeFileSync(assetAbsolutePath, options.content || "");

		asset.source = assetAbsolutePath;
		asset.content = options.content || "";

		// Revoke previous url if it exists
		if (cached?.contentURL) {
			URL.revokeObjectURL(cached.contentURL);
		}

		asset.contentURL = URL.createObjectURL(
			new Blob([asset.content], {
				type: MIME_TYPES[path.extname(options.source)],
			})
		);

		// If cached, merge cached and new asset
		if (cached) {
			ASSETS.set(assetAbsolutePath, merge(cached, asset));
		} else {
			ASSETS.set(assetAbsolutePath, asset);
		}
	}

	return asset;
}
 */
(window as any).addAsset = addAsset;

export function addLoader(loader: Loader) {
	LOADERS.push(loader);
}

export const BUNDLE_CONFIG: BundleConfig = cloneDeep(BUNDLE_DEFAULTS);
export function defineBundleConfig(config: BundleConfig) {
	merge(BUNDLE_CONFIG, config);
}

type BundleResult = {
	content: string;
	contentURL: string | null;
	contentDocURL: string | null;
};

const BUNDLE_CACHE: Map<string, Asset> = new Map();

let prevContentURL: any;
let prevContentDocURL: any;

/**
 * Bundle your assets starting from the entry point.
 * @returns {BundleResult} A bundle result.
 */
export async function bundle(): Promise<BundleResult> {
	console.clear();

	if (
		!ALLOWED_ENTRY_POINTS_PATTERN.test(BUNDLE_CONFIG.entry) &&
		path.extname(BUNDLE_CONFIG.entry)
	) {
		let error = new Error(`Invalid entry file ${BUNDLE_CONFIG.entry}.`);
		error.stack = "Bundle Error: ";
		throw error;
	}

	let bundleResult: BundleResult = {
		content: "",
		contentURL: null,
		contentDocURL: null,
	};

	let entryId = resolve.sync(BUNDLE_CONFIG.entry, {
		basedir: ".",
		extensions: RESOLVE_PRIORITY,
		includeCoreModules: false,
	});

	let graph = await createDependencyGraph(entryId);
	let bundle = new Bundle();
	let sourceMapBundle = combine.create(BUNDLE_CONFIG.output.filename);
	let usedCoreModules: any = [];
	let prevContentLines = 0;

	for (let asset of graph) {
		// [0] - Check cache
		let cached = BUNDLE_CACHE.get(asset.source);

		// If asset content didn't change
		if (cached?.content === asset.content && cached.compilationData) {
			let content = cached.compilationData.content;
			console.log("%c cached: ", "color: gold;", asset.source);

			if (isURL(asset.source) || asset.type == "text/css") {
				bundle.addSource({
					filename: asset.source,
					content: new MagicString(content),
				});

				// Offset source map
				prevContentLines += content.split("\n").length;
				continue;
			}

			// Extract core modules from cache
			for (let coreModule of cached.compilationData.coreModules) {
				let exists = usedCoreModules.some(
					(cm: any) => cm.imported === coreModule.imported
				);

				if (!exists) {
					usedCoreModules.push(coreModule);
				}
			}

			// Add to bundle
			bundle.addSource({
				filename: asset.source,
				content: new MagicString(content),
			});

			sourceMapBundle.addFile(
				{
					source: cached.compilationData.map.toComment(),
					sourceFile: asset.source,
				},
				{
					line: prevContentLines,
				}
			);

			// Offset source map
			prevContentLines += content.split("\n").length;

			// Then skip
			continue;
		}

		let isBlob = typeof asset.content != "string";
		let isExternal = isURL(asset.source);
		let isExternalScript = typeof asset.content == "string" && isExternal;

		if (typeof asset.content == "string" && !isExternal) {
			// [1] - Compile
			let compiled = await asset.loader.use.compile(asset.content, asset);

			let chunkContent = compiled.content;
			let chunkMap: SourceMapData | null = null;

			if (BUNDLE_CONFIG.output.sourceMap) {
				if (!compiled.map) {
					chunkMap = createSourceMap({
						file: asset.source,
						sources: [asset.source],
						sourcesContent: [asset.content],
					} as SourceMapData);
				} else {
					chunkMap = createSourceMap(compiled.map);
				}
			}

			// [2] - Transform
			let transformed = transformAsset(chunkContent, asset.source);

			// Store extracted core modules
			for (let coreModule of transformed.coreModules) {
				let exists = usedCoreModules.some(
					(cm: any) => cm.imported === coreModule.imported
				);

				if (!exists) {
					usedCoreModules.push(coreModule);
				}
			}

			// Update chunk
			chunkContent = transformed.content;
			chunkMap?.mergeWith(transformed.map);

			// [3] - Module definition
			let moduleDefined = chunkUMD(chunkContent, asset);

			// Update chunk
			chunkContent = moduleDefined.content;
			chunkMap?.mergeWith(moduleDefined.map);

			// [4] - Ready for bundle
			// Finalize chunk's source map
			if (chunkMap) {
				// Back to original contents
				chunkMap.sourcesContent[1] = asset.content;

				// Add source map to bundle
				sourceMapBundle.addFile(
					{
						source: chunkMap.toComment(),
						sourceFile: asset.source,
					},
					{
						line: prevContentLines,
					}
				);

				// Offset source map
				prevContentLines += chunkContent.split("\n").length;
			}

			// Add contents to bundle
			let chunkData = {
				filename: asset.source,
				content: new MagicString(chunkContent),
			};

			bundle.addSource(chunkData);

			// Cache
			let cacheData = {
				content: chunkContent,
				map: chunkMap,
				coreModules: transformed.coreModules,
			};

			if (asset) {
				asset.compilationData = cacheData;
			}

			BUNDLE_CACHE.set(asset.source, Object.assign({}, asset));
		} else if (isBlob || isExternalScript) {
			// Technically the same procedure above but without source maps and transformations
			let compiled: any = null;

			if (isExternalScript && typeof asset.content == "string") {
				compiled = await asset.loader.use.compile(asset.content, asset);
			} else {
				compiled = await asset.loader.use.compile("", asset);
			}

			let chunkContent = compiled.content;

			// [1] - Module definition
			let moduleDefined = chunkUMD(chunkContent, asset);

			// Update chunk
			chunkContent = moduleDefined.content;

			// [2] - Ready for bundle
			// Add contents to bundle
			let chunkData = {
				filename: asset.source,
				content: new MagicString(chunkContent),
			};

			bundle.addSource(chunkData);

			// Cache
			let cacheData = {
				content: chunkContent,
			};

			if (asset) {
				asset.compilationData = cacheData;
			}

			// Offset source map
			prevContentLines += chunkContent.split("\n").length;
			BUNDLE_CACHE.set(asset.source, Object.assign({}, asset));
		} else {
			let error = new Error(`${asset.source} is not supported.`);
			error.stack = "Asset Error: ";
			throw error;
		}
	}

	// [5] - Finalize bundle
	console.time("finalize");
	let UMDBundle = finalizeUMD(bundle.toString(), {
		entrySource: entryId,
		entryId: CACHED_ASSETS.get(entryId)?.id,
		name: BUNDLE_CONFIG.output.name,
	});

	let finalSourceMap = createSourceMap(
		convert.fromBase64(sourceMapBundle.base64()).toObject()
	);

	finalSourceMap.mergeWith(UMDBundle.map);

	// Import the core modules that was extracted during transformation
	let packageJSON: any = CACHED_ASSETS.get("/package.json");

	if (packageJSON?.content) {
		packageJSON = JSON.parse(packageJSON.content);
	}

	let importsBundle = new MagicString(UMDBundle.content);
	for (let coreModule of usedCoreModules) {
		// Check package.json for version
		if (
			packageJSON?.dependencies &&
			coreModule.parsed.name in packageJSON.dependencies
		) {
			let packageJSONVersion = packageJSON.dependencies[coreModule.parsed.name];

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

		let importCode = `import * as ${coreModule.name} from "${
			skypackURL + coreModule.imported
		}";\n`;

		importsBundle.prepend(importCode);
	}

	// Update package.json
	let coreModulesJSON = usedCoreModules.reduce((acc: any, cur: any) => {
		acc[cur.parsed.name] = cur.usedVersion || cur.parsed.version;
		return acc;
	}, {});

	addAsset(
		"/package.json",
		JSON.stringify(
			Object.assign(packageJSON, {
				dependencies: {
					...packageJSON.dependencies,
					...coreModulesJSON,
				},
			})
		)
	);

	// Finalize content
	finalSourceMap.mergeWith(
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
			finalSourceMap.mergeWith(minified.map);
		}
	}

	// Out source map
	let outputPath = path.join(
		BUNDLE_CONFIG.output.path,
		BUNDLE_CONFIG.output.filename
	);

	if (BUNDLE_CONFIG.output.sourceMap) {
		if (BUNDLE_CONFIG.output.sourceMap === "inline") {
			// Inline source map
			finalContent += finalSourceMap.toComment();
		} else {
			// External source map
			let sourceMapAsset = await addAsset(
				outputPath + ".map",
				finalSourceMap.toString()
			);

			finalContent += "\n//# sourceMappingURL=" + sourceMapAsset.source;
		}
	}

	// Out bundle
	await addAsset(outputPath, finalContent);

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
	console.log(graph);

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
