import { Asset } from "@toypack/loaders/types";
import MagicString from "magic-string";
import autoprefixer from "autoprefixer";
import postcss from "postcss";
export default async function compile(content: string, asset: Asset) {
	let chunkContent = asset.data ? asset.data.AST.toString() : content;

	if (asset.data) {
		chunkContent = await postcss([autoprefixer]).process(chunkContent).css;
	}

	let styleContent = "let __styleContent__ = \"\"";
	for (let line of chunkContent.split("\n")) {
		// Escape quotes
		line = line.replaceAll('"', '\\"');
		styleContent += `.concat("${line}")`;
	}

	let chunk = new MagicString(content);

	// For dummy source map
	chunk.update(0, chunk.length(), styleContent);

	chunk
		.append(
			`
let __head__ = document.head || document.getElementsByTagName("head")[0];
__stylesheet__ = document.createElement("style");
__stylesheet__.dataset.toypackId = "${asset.source}";
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
	
	chunk.prepend(`let __stylesheet__ = document.querySelector("[data-toypack-id~='${asset.source}']");`);

	// Imports
	for (let dependency in asset.dependencyMap) {
		chunk.prepend(`require("${dependency}");\n`);
	}

	// Exports
	chunk.append("exports.default = __stylesheet__");

	// TODO: Source map support
	return {
		content: chunk.toString(),
		// Temporarily add a poorly generated source map
		map: chunk.generateMap({
			file: asset.source,
			source: asset.source,
		}),
	};
}
