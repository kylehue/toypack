import { SourceMapData } from "@toypack/core/SourceMap";
import { BUNDLE_CONFIG } from "@toypack/core/Toypack";
import { Asset } from "@toypack/loaders/types";
import MagicString from "magic-string";
export default async function compile(content: string, asset: Asset) {
	let chunk = new MagicString(content);
	console.log(
		chunk.generateMap({
			file: asset.source,
			source: asset.source,
			hires: !BUNDLE_CONFIG.output.optimizeSourceMap,
			includeContent: true,
		})
	);
	
	return {
		content: chunk.toString(),
		map: chunk.generateMap({
			file: asset.source,
			source: asset.source,
			hires: !BUNDLE_CONFIG.output.optimizeSourceMap,
			includeContent: true,
		}),
	};
}
