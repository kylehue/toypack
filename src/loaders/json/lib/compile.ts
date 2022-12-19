import { BUNDLE_CONFIG } from "@toypack/core/Toypack";
import { Asset } from "@toypack/loaders/types";
import MagicString from "magic-string";

async function compile(content: string | Uint8Array, asset: Asset) {
	if (typeof content != "string") {
		let error = new Error("JSON Compile Error: Content must be string.");
		throw error;
	}

	let chunk = new MagicString(content);

	chunk.prepend("module.exports = ");

	return {
		content: chunk.toString(),
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