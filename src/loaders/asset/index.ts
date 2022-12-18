import { default as parse } from "./lib/parse";
import { default as compile } from "./lib/compile";
import { Loader } from "../types";

export default {
	name: "AssetLoader",
	test: /\.(png|jpe?g|gif|svg|bmp|tiff?|woff|woff2|ttf|eot|otf|webp|mp[34]|wav|mkv|wmv|m4v|mov|avi|flv|webm|flac|mka|m4a|aac|ogg)(\?.*)?$/i,
	use: {
		parse,
		compile,
	},
} as Loader;
