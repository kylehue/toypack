import { createSourceMap, SourceMapData } from "@toypack/core/SourceMap";
import Toypack from "@toypack/core/Toypack";
import {
	AssetInterface,
	CompiledAsset,
	Loader,
	ParsedAsset,
} from "@toypack/core/types";
import MagicString from "magic-string";

export default class JSONLoader implements Loader {
	public name = "JSONLoader";
	public test = /\.json$/;

	public compile(asset: AssetInterface, bundler: Toypack) {
		if (typeof asset.content != "string") {
			let error = new Error(
				"JSON Compile Error: Asset content must be string."
			);
			throw error;
		}

      let chunk = new MagicString(asset.content);
      chunk.prepend("module.exports = ");

      let map: SourceMapData = {} as SourceMapData;
		if (bundler.options.bundleOptions.output.sourceMap) {
			map = chunk.generateMap({
				file: asset.source,
				source: asset.source,
				includeContent: true,
				hires: true,
			});
		}

		let result: CompiledAsset = {
			content: chunk.toString(),
			map,
		};

		return result;
	}
}
