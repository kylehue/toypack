import { SourceMapData } from "@toypack/core/SourceMap";
import { BUNDLE_CONFIG } from "@toypack/core/Toypack";
import { Asset } from "@toypack/loaders/types";
import MagicString from "magic-string";
export default async function compile(content: string, asset: Asset) {
	if (!asset.data) {
		console.error(
			"Compilation Error: Asset's data is empty. Make sure that you're returning a <ParsedAsset> data when parsing."
		);
		return;
	}

	let chunk = new MagicString(content);

	return {
		content: chunk.toString(),
		map: chunk.generateMap({
			file: asset.id,
			source: asset.id,
			hires: !BUNDLE_CONFIG.output.optimizeSourceMap,
			includeContent: true,
		}),
	};
}
