import { Asset } from "@toypack/loaders/types";
import MagicString from "magic-string";

export default async function compile(content: string, asset: Asset) {
	return {
		map: {},
		content: `module.exports = "${asset.contentURL || ""}"`,
	};
}
