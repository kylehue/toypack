import { default as parse } from "./lib/parse";
import { default as compile } from "./lib/compile";
import { Loader } from "../types";

export default {
	name: "HTMLLoader",
	test: /\.html$/,
	use: {
		parse,
		compile,
	},
} as Loader;