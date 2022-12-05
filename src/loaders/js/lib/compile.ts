import { Asset, MagicString } from "@toypack/loaders/types";

export default function compile(content: MagicString, asset: Asset) {
   // No need to compile .js files so we just return the content (?)
	return content;
}