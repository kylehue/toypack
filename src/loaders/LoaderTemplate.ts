import { createSourceMap } from "@toypack/core/SourceMap";
import Toypack from "@toypack/core/Toypack";
import { AssetInterface, CompiledAsset, Loader, ParsedAsset } from "@toypack/core/types";

export default class LoaderTemplate implements Loader {
	public name = "LoaderTemplate";
	public test = /\.([jt]sx?)$/;

	public parse(asset: AssetInterface, bundler: Toypack) {
		let result: ParsedAsset = {
			dependencies: [],
		};

		return result;
	}

	public compile(asset: AssetInterface, bundler: Toypack) {
		let result: CompiledAsset = {
			content: "",
			map: createSourceMap({}),
		};

		return result;
	}
}
