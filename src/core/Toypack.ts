import fs from "fs";
import * as path from "path";
import resolve from "resolve";
import createDependencyGraph from "@toypack/core/dependencyGraph";
import transformAsset from "@toypack/core/transformAsset";
import {
	AssetLoader,
	HTMLLoader,
	CSSLoader,
	SassLoader,
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
import { createSourceMap, SourceMapData } from "@toypack/core/SourceMap";
import MagicString, { Bundle } from "magic-string";
import combine from "combine-source-map";
import convert from "convert-source-map";
import babelMinify from "babel-minify";
import merge from "lodash.merge";
import cloneDeep from "lodash.clonedeep";
import { vol } from "memfs";

export const LOADERS: Loader[] = [
	BabelLoader,
	HTMLLoader,
	CSSLoader,
	SassLoader,
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
export async function bundle() {
	console.clear();
	console.time("Total bundle time");
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

	let entrySource = resolve.sync(BUNDLE_CONFIG.entry, {
		basedir: ".",
		extensions: RESOLVE_PRIORITY,
		includeCoreModules: false,
	});

	let entryId = CACHED_ASSETS.get(entrySource)?.id;

	let graph = await createDependencyGraph(entrySource);
	let contentBundle = new Bundle();
	let sourceMapBundle = combine.create(BUNDLE_CONFIG.output.filename);
	let prevContentLines = 0;

	let usedCoreModules: any = [];

	const addCoreModules = (coreModules: any) => {
		if (coreModules) {
			for (let chunkCoreModule of coreModules) {
				let isAdded = usedCoreModules.some(
					(ucm: any) => ucm.imported === chunkCoreModule.imported
				);
				if (!isAdded) {
					usedCoreModules.push(chunkCoreModule);
				}
			}
		}
	}

	const addSourceMap = (sourceMap: SourceMapData | null, asset: Asset, offset: number = 0) => {
		if (sourceMap) {
			if (typeof asset.content == "string") {
				// Back to original contents
				sourceMap.sourcesContent[1] = asset.content;
			}

			// Add source map to bundle
			sourceMapBundle.addFile(
				{
					source: sourceMap.toComment(),
					sourceFile: asset.source,
				},
				{
					line: prevContentLines,
				}
			);

			// Offset source map
			prevContentLines += offset;
		}
	}

	for (let i = 0; i < graph.length; i++) {
		let asset = graph[i];
		// [0] - Check cache
		let cached = BUNDLE_CACHE.get(asset.source);
		// If asset and cached asset contents are the same, skip
		if (asset.content == cached?.content) {
			console.log("%c cached: ", "color: gold;", asset.source);
			// Add contents to bundle
			let chunkData = {
				filename: asset.source,
				content: new MagicString(asset.compilationData.content),
			};

			contentBundle.addSource(chunkData);
			addCoreModules(asset.compilationData.coreModules);
			addSourceMap(
				asset.compilationData.map,
				asset,
				asset.compilationData.content.split("\n").length
			);
			continue;
		} else {
			BUNDLE_CACHE.set(asset.source, Object.assign({}, asset));
		}

		console.log("%c compiling: ", "color: red;", asset.source);
		let isFirst = i === 0;
		let isLast = i === graph.length - 1;

		let chunkContent = "";
		let chunkSourceMap: SourceMapData | null = null;

		// [1] - Compile
		let compiled = await asset.loader.use.compile(asset.content, asset);

		// Update chunk
		chunkContent = compiled.content;
		if (BUNDLE_CONFIG.output.sourceMap) {
			if (!compiled.map) {
				chunkSourceMap = createSourceMap({
					file: asset.source,
					sources: [asset.source],
					sourcesContent: [asset.content],
				} as SourceMapData);
			} else {
				chunkSourceMap = createSourceMap(compiled.map);
			}
		}

		// [2] - Transform
		let transformed = transformAsset(chunkContent, asset, {
			isFirst,
			isLast,
			entryId,
		});

		// Update chunk
		chunkContent = transformed.content;

		if (transformed.map) {
			chunkSourceMap?.mergeWith(transformed.map);
		}

		addCoreModules(transformed.coreModules);

		// [3] - Add to bundle
		// Finalize chunk's source map
		addSourceMap(chunkSourceMap, asset, chunkContent.split("\n").length);

		// Add contents to bundle
		let chunkData = {
			filename: asset.source,
			content: new MagicString(chunkContent),
		};

		contentBundle.addSource(chunkData);

		// Add to compilation data for caching
		asset.compilationData = {
			content: chunkContent,
			map: chunkSourceMap,
			coreModules: transformed.coreModules
		};
	}

	// [4] - Bundle
	let finalSourceMap = BUNDLE_CONFIG.output.sourceMap
		? createSourceMap(convert.fromBase64(sourceMapBundle.base64()).toObject())
		: null;
	let finalContent = contentBundle.toString() + finalSourceMap?.toComment();

	// [5] - Import the core modules that was extracted during transformation
	let packageJSON: any = CACHED_ASSETS.get("/package.json");

	if (packageJSON?.content) {
		packageJSON = JSON.parse(packageJSON.content);
	}

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
		}";`;

		finalContent = importCode + finalContent;
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

	bundleResult.content = finalContent;

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

	console.log(bundleResult);

	console.timeEnd("Total bundle time");

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
