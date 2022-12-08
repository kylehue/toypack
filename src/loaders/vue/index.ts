import { default as parse } from "./lib/parse";
import { default as compile } from "./lib/compile";
import { Loader } from "../types";

export default {
	name: "VueLoader",
	test: /\.vue$/,
	use: {
		parse,
		compile,
	},
} as Loader;
