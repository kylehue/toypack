import {
	transform as babelTransform,
	availablePlugins,
} from "@babel/standalone";
import MagicString from "magic-string";
import { createSourceMap, merge, SourceMap } from "./SourceMap";
import Toypack from "./Toypack";
import { AssetInterface, CompiledAsset } from "./types";

export default function transform(
	chunk: MagicString,
	asset: AssetInterface,
	bundler: Toypack
) {
	let result: CompiledAsset = {
		content: {} as MagicString,
		metadata: {
			coreModules: [],
		},
	};

	// [1] - Transpile
	let transpiled = babelTransform(chunk.toString(), {
		sourceType: "module",
		sourceFileName: asset.source,
		filename: asset.source,
		sourceMaps: !!bundler.options.bundleOptions?.output?.sourceMap,
		compact: false,
		presets: ["typescript", "react"],
		plugins: [availablePlugins["transform-modules-commonjs"]],
		comments: false
	});

	// If transpile result is empty, return
	if (!transpiled.code) {
		result.content = new MagicString("");
		return result;
	}

	// Instantiate content and source map
	let chunkContent = new MagicString(transpiled.code);
	let chunkSourceMap = {} as SourceMap;
	if (transpiled.map) {
		let origSourceMap = chunk.generateMap({
			source: asset.source,
			includeContent: false,
			hires: bundler._sourceMapConfig[1] == "original",
		});

		let generatedSourceMap = transpiled.map;

		chunkSourceMap =
			createSourceMap(origSourceMap).mergeWith(generatedSourceMap);
	}

	result.content = chunkContent;
	result.map = chunkSourceMap;

	return result;
}
