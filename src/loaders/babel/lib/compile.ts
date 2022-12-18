import { SourceMapData } from "@toypack/core/SourceMap";
import { BUNDLE_CONFIG } from "@toypack/core/Toypack";
import { Asset } from "@toypack/loaders/types";
import traverseAST from "@babel/traverse";
import MagicString from "magic-string";
async function compile(content: string | Uint8Array, asset: Asset) {
	if (typeof content != "string") {
		let error = new Error("Content must be string.");
		error.stack = "Babel Compile Error: ";
		throw error;
	}

	let chunk = new MagicString(content);
	
	return {
		content: content,
		map: BUNDLE_CONFIG.output.sourceMap
			? chunk.generateMap({
					file: asset.source,
					source: asset.source,
					includeContent: true,
					hires: true,
			  })
			: {},
	};
}

export default compile;