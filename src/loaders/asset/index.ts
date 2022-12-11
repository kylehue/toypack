import { default as parse } from "./lib/parse";
import { default as compile } from "./lib/compile";
import { Loader } from "../types";

export default {
	name: "AssetLoader",
	test: /\.(png|jpe?g|gif|svg|bmp|tiff?|webp|mp[34]|wav|mkv|wmv|m4v|mov|avi|flv|webm|flac|mka|m4a|aac|ogg)$/,
	use: {
		parse,
		compile,
	},
} as Loader;
