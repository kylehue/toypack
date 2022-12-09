import { SourceMapData } from "@toypack/core/SourceMap";
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
			hires: true,
			includeContent: true,
		}),
	};
}
