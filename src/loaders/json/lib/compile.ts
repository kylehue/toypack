import { Asset } from "@toypack/loaders/types";
import MagicString from "magic-string";

export default async function compile(content: string, asset: Asset) {
   let chunk = new MagicString(content);

   chunk.prepend("export default ");

	return {
		map: chunk.generateMap({
			file: asset.source,
			source: asset.source,
			includeContent: true,
		}),
		content: chunk.toString(),
	};
}
