import { Asset, MagicString } from "@toypack/loaders/types";
import autoprefixer from "autoprefixer";
import postcss from "postcss";
export default function compile(chunk: MagicString, asset: Asset) {
	let fromAST = asset.data.AST.toString();
	let processedContent = postcss([autoprefixer]).process(fromAST).css;

	let e = "let __styleContent__ = \"\"";
	for (let line of processedContent.split("\n")) {
		e += `.concat("${line}")`;
	}

	chunk.replace(chunk.toString(), e);
	chunk
		.append(
			`
let __head__ = document.head || document.getElementsByTagName("head")[0];
__stylesheet__ = document.createElement("style");
__stylesheet__.dataset.toypackId = "${asset.id}";
__stylesheet__.setAttribute("type", "text/css");
__head__.appendChild(__stylesheet__);

if (__stylesheet__.styleSheet){
  __stylesheet__.styleSheet.cssText = __styleContent__;
} else {
  __stylesheet__.appendChild(document.createTextNode(__styleContent__));
}
`
		);

	// Avoid style duplicates
	chunk.indent("\t").prepend(`if (!__stylesheet__) {\n`).append("\n}");
	
	chunk.prepend(`let __stylesheet__ = document.querySelector("[data-toypack-id~='${asset.id}']");`);

	// Imports
	for (let dependency in asset.dependencyMap) {
		chunk.prepend(`require("${dependency}");\n`);
	}

	// Exports
	chunk.append("exports.default = __stylesheet__;")

	return chunk;
}
