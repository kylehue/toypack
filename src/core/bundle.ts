import { transform } from "@babel/standalone";
import { AssetLoader } from "@toypack/loaders";
import { formatPath, isURL } from "@toypack/utils";
import { cloneDeep, merge } from "lodash";
import SourceMap from "./SourceMap";
import MagicString, { Bundle } from "magic-string";
import path from "path-browserify";
import Toypack, { textExtensions } from "./Toypack";
import { CompiledAsset, BundleOptions, BundleResult } from "./types";
import createGraph from "./createGraph";
import MapCombiner from "combine-source-map";
import MapConverter from "convert-source-map";
import applyUMD from "@toypack/formats/umd";
import babelMinify from "babel-minify";

const colors = {
	success: "#3fe63c",
	warning: "#f5b514",
	danger: "#e61c1c",
	info: "#3b97ed",
};

function getTimeColor(time: number) {
	if (time < 5000) {
		return colors.success;
	} else if (time < 10000) {
		return colors.warning;
	} else {
		return colors.danger;
	}
}

export default async function bundle(
	bundler: Toypack,
	options?: BundleOptions
) {
	if (options) {
		options = merge(cloneDeep(bundler.options.bundleOptions || {}), options);
	} else {
		options = bundler.options.bundleOptions;
	}

	let entrySource = bundler.resolve(path.join("/", options?.entry || ""));

	if (!entrySource) {
		throw new Error(`Bundle Error: Entry point not found.`);
	}

	bundler.outputSource = formatPath(
		entrySource,
		options?.output?.filename || ""
	);

	let entryOutputPath = path.join(
		options?.output?.path || "",
		bundler.outputSource
	);

	let sourceMapOutputSource = entryOutputPath + ".map";

	let graphTotalTime: number = 0;
	let graphStartTime: number = 0;
	if (options?.logs) {
		graphStartTime = performance.now();
	}

	let graph = await createGraph(bundler, entrySource);

	let bundleTotalTime: number = 0;
	let bundleStartTime: number = 0;
	if (options?.logs) {
		bundleStartTime = performance.now();
		graphTotalTime = bundleStartTime - graphStartTime;
	}

	let bundle = new Bundle();
	let sourceMap: MapCombiner | null = null;

	if (options?.output?.sourceMap && options?.mode == "development") {
		sourceMap = MapCombiner.create(sourceMapOutputSource);
	}

	let cachedCounter = 0;
	let compiledCounter = 0;

	let prevLine = 0;

	for (let i = 0; i < graph.length; i++) {
		const asset = graph[i];

		let chunkContent = {} as MagicString;
		let chunkSourceMap: SourceMap = new SourceMap();

		const isFirst = i === 0;
		const isLast = i === graph.length - 1 || graph.length == 1;
		const isCoreModule = /^\/node_modules\//.test(asset.source);

		// [1] - Compile
		let compilation: CompiledAsset = {} as CompiledAsset;
		if (asset.isModified || !asset.loaderData.compile?.content) {
			if (typeof asset.loader.compile == "function") {
				compilation = await asset.loader.compile(asset, bundler);
				bundler._initHooks("afterCompile", {
					compilation,
					asset,
				});
			}
			compiledCounter++;
		} else {
			compilation = asset.loaderData.compile;
			cachedCounter++;
		}

		// If compiler didn't return any content, use asset's raw content
		// This is for assets that don't need compilation
		if (!compilation.content) {
			let rawContent = typeof asset.content == "string" ? asset.content : "";
			compilation.content = new MagicString(rawContent);
		}

		// Save to loader data
		asset.loaderData.compile = compilation;

		// Update chunk
		chunkContent = compilation.content;
		chunkSourceMap.mergeWith(compilation.map);

		// [2] - Format
		let formatted = applyUMD(chunkContent.clone(), asset, bundler, {
			entryId: bundler.assets.get(entrySource)?.id,
			isFirst,
			isLast,
		});

		// Update chunk
		chunkContent = formatted.content;
		chunkSourceMap.mergeWith(formatted.map);

		// [3] - Add to bundle
		bundle.addSource({
			filename: asset.source,
			content: chunkContent,
		});

		let isMapped =
			!!sourceMap &&
			!!chunkSourceMap &&
			textExtensions.includes(asset.extension) &&
			typeof asset.content == "string" &&
			!isCoreModule;

		if (isMapped) {
			chunkSourceMap.mergeWith(
				chunkContent.generateMap({
					source: asset.source,
					includeContent: false,
					hires: bundler._sourceMapConfig[1] == "hires",
				})
			);

			// Add sources content
			if (
				bundler._sourceMapConfig[2] == "sources" &&
				typeof asset.content == "string"
			) {
				chunkSourceMap.sourcesContent[0] = asset.content;
			}

			sourceMap?.addFile(
				{
					sourceFile: asset.source,
					source: chunkSourceMap.toComment(),
				},
				{
					line: prevLine,
				}
			);
		}

		// Offset source map
		if (sourceMap) {
			let offset = chunkContent.toString().split("\n").length;
			prevLine += offset;
		}
	}

	//
	let finalContent = bundle.toString();

	// Minify if in production mode
	if (options?.mode == "production") {
		let transpiled = transform(finalContent, {
			presets: ["env", "es2015-loose"],
		});

		let minified = babelMinify(transpiled.code, {
			mangle: {
				topLevel: true,
				keepClassName: true,
			},
		});

		finalContent = minified.code;
	}

	if (sourceMap) {
		let sourceMapObject = MapConverter.fromBase64(
			sourceMap?.base64()
		).toObject();

		if (bundler._sourceMapConfig[2] == "nosources") {
			sourceMapObject.sourcesContent = [];
		}

		if (
			options?.mode == "development" ||
			bundler._sourceMapConfig[0] == "inline"
		) {
			finalContent += MapConverter.fromObject(sourceMapObject).toComment();
		} else {
			// Out source map
			await bundler.addAsset(
				sourceMapOutputSource,
				JSON.stringify(sourceMapObject)
			);

			let sourceMapBasename = path.basename(sourceMapOutputSource);

			finalContent += `\n//# sourceMappingURL=${sourceMapBasename}`;
		}
	}

	let bundleResult: BundleResult = {
		content: finalContent,
		contentURL: null,
		contentDoc: null,
		contentDocURL: null,
	};

	if (bundler._prevContentURL?.startsWith("blob:")) {
		URL.revokeObjectURL(bundler._prevContentURL);
	}

	bundleResult.contentURL = URL.createObjectURL(
		new Blob([finalContent], {
			type: "application/javascript",
		})
	);

	bundler._prevContentURL = bundleResult.contentURL;

	bundleResult.contentDoc = `<!DOCTYPE html>
<html>
	<head>
		<script defer src="${bundleResult.contentURL}"></script>
	</head>
	<body>
	</body>
</html>
`;

	if (bundler._prevContentDocURL?.startsWith("blob:")) {
		URL.revokeObjectURL(bundler._prevContentDocURL);
	}

	bundleResult.contentDocURL = URL.createObjectURL(
		new Blob([bundleResult.contentDoc], {
			type: "text/html",
		})
	);

	bundler._prevContentDocURL = bundleResult.contentDocURL;

	// Out
	if (options?.mode == "production") {
		// Out bundle
		await bundler.addAsset(entryOutputPath, bundleResult.content);

		// Out resources
		if (options?.output?.resourceType == "external") {
			for (let asset of graph) {
				// Skip if not a local resource
				if (!(asset.loader instanceof AssetLoader) || isURL(asset.source))
					continue;
				let resource = asset;
				let resourceOutputFilename = formatPath(
					resource.source,
					options?.output?.assetFilename || ""
				);
				let resourceOutputPath = path.join(
					options?.output?.path || "",
					resourceOutputFilename
				);

				await bundler.addAsset(resourceOutputPath, bundleResult.content);
			}
		}
	}

	if (options?.logs) {
		bundleTotalTime = performance.now() - bundleStartTime;

		console.log(
			`%cTotal graph time: %c${graphTotalTime.toFixed(0)} ms`,
			"font-weight: bold; color: white;",
			"color: " + getTimeColor(graphTotalTime)
		);

		console.log(
			`%cTotal bundle time: %c${bundleTotalTime.toFixed(0)} ms`,
			"font-weight: bold; color: white;",
			"color: " + getTimeColor(bundleTotalTime)
		);

		console.log(
			`%cCached assets: %c${cachedCounter.toString()}`,
			"font-weight: bold; color: white;",
			"color: #cfd0d1;"
		);

		console.log(
			`%cCompiled assets: %c${compiledCounter.toString()}`,
			"font-weight: bold; color: white;",
			"color: #cfd0d1;"
		);
	}

	return bundleResult;
}