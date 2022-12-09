import { ParserOptions } from "@babel/parser";

export interface OutputOptions {
	path: string;
	filename: string;
	type?: "umd";
	sourceMap?: boolean | "inline";

	/**
	 * The name of your library.
	 */
	name?: string;
}

export interface BundleOptions {
	mode?: "development" | "production";
	entry: string;
	output: OutputOptions;
	plugins?: Array<Function>;
}

export const BUNDLE_DEFAULTS: BundleOptions = {
	entry: "",
	mode: "production",
	plugins: [],
	output: {
		path: "dist",
		filename: "",
		type: "umd",
		sourceMap: true,
		name: "",
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
