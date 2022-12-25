import {
	transform as babelTransform,
} from "@babel/standalone";
import MagicString from "magic-string";
import SourceMap, { SourceMapData } from "./SourceMap";
import Toypack from "./Toypack";
import { AssetInterface, CompiledAsset } from "./types";
import { TransformOptions } from "@babel/core";
import { isURL } from "@toypack/utils";
import mergeSourceMap from "merge-source-map";
export default function transform(
	chunk: MagicString,
	asset: AssetInterface,
	bundler: Toypack,
	transformOptions: TransformOptions = {}
) {
	let result: CompiledAsset = {
		content: {} as MagicString,
		metadata: {
			coreModules: [],
		},
	};

	const isCoreModule = /^\/?node_modules\/?/.test(asset.source);

	transformOptions = Object.assign(
		{
			sourceFileName: asset.source,
			filename: asset.source,
			compact: false,
			comments: false,
		},
		transformOptions
	);
	
	// Make SourceMap option immutable
	transformOptions.sourceMaps =
		!!bundler.options.bundleOptions?.output?.sourceMap &&
		!isCoreModule &&
		!isURL(asset.source);

	// [1] - Transpile
	let transpiled = babelTransform(chunk.toString(), transformOptions);

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
		chunkSourceMap = new SourceMap(origSourceMap).mergeWith(generatedSourceMap); 
	}

	result.content = chunkContent;
	result.map = chunkSourceMap;

	return result;
}
