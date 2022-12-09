import { ParserOptions } from "@babel/parser";

export const BUNDLE_DEFAULTS = {
	entry: null,
	mode: "production",
	plugins: [],
	output: {
		path: "dist",
		filename: null,
		type: "umd",
		sourceMap: true,
		name: null,
	},
};

export const BABEL_PARSE_DEFAULTS: ParserOptions = {
	allowImportExportEverywhere: true,
	allowReturnOutsideFunction: true,
	allowAwaitOutsideFunction: true,
	allowSuperOutsideMethod: true,
	allowUndeclaredExports: true,
	attachComment: false,
};
