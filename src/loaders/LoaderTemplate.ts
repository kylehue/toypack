import Toypack from "@toypack/core/Toypack";
import { AssetInterface, CompiledAsset, Loader, ParsedAsset } from "@toypack/core/types";
import MagicString from "magic-string";

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
			content: {} as MagicString,
		};

		return result;
	}
}
