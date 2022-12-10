import { ParserOptions } from "@babel/parser";

export interface OutputOptions {
	/**
	 * The output directory of the bundle.
	 */
	path: string;
	/**
	 * The output filename of the bundle.
	 */
	filename: string;
	/**
	 * - Set to `true` to generate a sourcemap for the code and add it in the file system.
	 * - Set to `inline` to generate a sourcemap and append it in the bundle content as a data URL.
	 */
	sourceMap?: boolean | "inline";
	/**
	 * Module definition.
	 */
	type?: "umd";

	/**
	 * The name of your library.
	 */
	name?: string;

	/**
	 * Whether to add object URLs in the bundle output or not. This is useful if you want to use the bundle in an <iframe>.
	 */
	contentURL?: boolean;
	optimizeSourceMap?: boolean;
}

export interface BundleConfig {
	/**
	 * - Set to `development` to optimize use in the browser.
	 * - Set to `production` to ready the output for deployment. This will take a longer time to bundle and it will result in a larger output size.
	 */
	mode?: "development" | "production";
	entry: string;
	output: OutputOptions;
	plugins?: Array<Function>;
}

export const BUNDLE_DEFAULTS: BundleConfig = {
	entry: "",
	mode: "production",
	plugins: [],
	output: {
		path: "dist",
		filename: "",
		type: "umd",
		sourceMap: true,
		name: "",
		contentURL: true,
		optimizeSourceMap: false
	},
};

export const BABEL_PARSE_DEFAULTS: ParserOptions = {
	allowImportExportEverywhere: true,
	allowReturnOutsideFunction: true,
	allowAwaitOutsideFunction: true,
	allowSuperOutsideMethod: true,
	allowUndeclaredExports: true,
	attachComment: true,
};
