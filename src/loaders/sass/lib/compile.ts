import { Asset } from "@toypack/loaders/types";
import Sass from "sass.js";
import { CACHED_ASSETS, LOADERS } from "@toypack/core/Toypack";
import resolve from "resolve";
import { dirname } from "path";
import { createSourceMap } from "@toypack/core/SourceMap";
export default async function compile(
	content: string | Uint8Array,
	asset: Asset
) {
	if (typeof content != "string") {
		let error = new Error("Sass Compile Error: Content must be string.");
		throw error;
	}

	let chunkContent = content;

	if (typeof asset.data?.AST == "object") {
		chunkContent = asset.data.AST.toString();
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
			chunkContent,
			{
				indentedSyntax: /\.sass$/.test(asset.source),
			},
			(result) => {
				fulfill(result);
			}
		);
	});

	// Get CSS loader
	let CSSLoader = LOADERS.find(ldr => ldr.name === "CSSLoader");
	let JSCompilation;
	if (CSSLoader) {
		JSCompilation = await CSSLoader.use.compile(CSSCompilation.text, asset, {
			useContent: true
		});
	} else {
		let error = new Error("Sass Compile Error: CSS compiler is required to compile Sass files.");
		throw error;
	}

	console.log(LOADERS.find((ldr) => ldr.name === "TestLoader"));

	return {
		map: createSourceMap(CSSCompilation.map).mergeWith(JSCompilation.map),
		content: JSCompilation.content,
	};
}
