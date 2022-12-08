import { Asset } from "@toypack/loaders/types";
import {
	transform as babelTransform,
	availablePlugins,
} from "@babel/standalone";

export default async function compile(content: string, asset: Asset) {
	if (!asset.data) {
		console.error(
			"Compilation Error: Asset's data is empty. Make sure that you're returning a <ParsedAsset> data when parsing."
		);
		return;
	}
	
	let transpiled = babelTransform(content, {
		presets: ["es2015-loose"],
		compact: true,
		sourceMaps: true,
		sourceFileName: asset.id,
		sourceType: "module",
	});

	return {
      content: transpiled.code,
      map: transpiled.map
	};
}
