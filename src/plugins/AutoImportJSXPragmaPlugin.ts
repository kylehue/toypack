import Toypack from "@toypack/core/Toypack";
import { ToypackPlugin } from "@toypack/core/types";

export default class AutoImportJSXPragmaPlugin implements ToypackPlugin {
	apply(bundler: Toypack) {
		bundler.hooks.afterCompile(({ asset, compilation }) => {
			if (/\.[jt]sx$/.test(asset.source)) {
				compilation.content.prepend('\nvar React = require("react");');
			}
		});
	}
}
