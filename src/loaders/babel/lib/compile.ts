import { SourceMapData } from "@toypack/core/SourceMap";
import { BUNDLE_CONFIG } from "@toypack/core/Toypack";
import { Asset } from "@toypack/loaders/types";
import MagicString from "magic-string";
async function compile(content: string | Uint8Array, asset: Asset) {
	if (typeof content != "string") {
		let error = new Error("Content must be string.");
		error.stack = "Babel Compile Error: ";
		throw error;
	}

	return {
		content: content,
		map: {},
	};
}

export default compile;