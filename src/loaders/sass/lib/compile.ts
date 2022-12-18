import { Asset } from "@toypack/loaders/types";
import Sass from "sass.js";
import { CACHED_ASSETS } from "@toypack/core/Toypack";
import resolve from "resolve";
import { dirname } from "path";
import compileCSS from "@toypack/loaders/css/lib/compile"
import { createSourceMap } from "@toypack/core/SourceMap";
export default async function compile(
	content: string | Uint8Array,
	asset: Asset
) {
	if (typeof content != "string") {
		let error = new Error("Content must be string.");
		error.stack = "Sass Compile Error: ";
		throw error;
	}

	let CSSCompilation: any = await new Promise((fulfill) => {
		Sass.importer((request, done) => {
			let requestedSource = resolve.sync(request.current, {
				basedir: dirname(asset.source),
				extensions: [".sass", ".scss", ".less", ".css"]
			});
			
			let cached = CACHED_ASSETS.get(requestedSource);
			
			done({
				content: cached?.content,
			});
		});

		Sass.compile(
			content,
			{
				indentedSyntax: /\.sass$/.test(asset.source)
			},
			(result) => {
				// Make text result blank if it's null
				// This will allow Sass files with no style declarations to be compiled
				result.text = result.text || "";

				fulfill(result);
			}
		);
	});

	let JSCompilation = await compileCSS(CSSCompilation.text, asset);

	return {
		map: createSourceMap(CSSCompilation.map).mergeWith(JSCompilation.map),
		content: JSCompilation.content,
	};
}
