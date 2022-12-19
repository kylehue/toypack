import { ParsedAsset } from "@toypack/loaders/types";
import { LOADERS } from "@toypack/core/Toypack";
import postcssSASS from "postcss-sass";
import postcssSCSS from "postcss-scss";
import { isURL } from "@toypack/utils";
export default function parse(content: string | Uint8Array, source: string) {
	if (typeof content != "string") {
		let error = new Error("Sass Parse Error: Content must be string.");
		throw error;
	}
	
	const result: ParsedAsset = {
		AST: [],
		dependencies: [],
	};

	// Get CSS loader
	let CSSLoader = LOADERS.find(ldr => ldr.name === "CSSLoader");

	if (CSSLoader) {
		let parsed = CSSLoader.use.parse(content, source, {
			postCSSOptions: {
				syntax: /\.sass$/.test(source) ? postcssSASS : postcssSCSS,
			},
			checkAtRules(node, importId) {
				// Only include URL imports and let Sass compiler handle local imports
				if (isURL(importId)) {
					node.remove();
					result.dependencies.push(importId);
				}
			}
		});

		result.AST = parsed.AST;
	} else {
		let error = new Error(
			"Sass Parse Error: CSS parser is required to parse Sass files."
		);
		throw error;
	}

	return result;
}
