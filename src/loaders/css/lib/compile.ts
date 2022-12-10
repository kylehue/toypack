import { Asset } from "@toypack/loaders/types";
import MagicString from "magic-string";
import autoprefixer from "autoprefixer";
import postcss from "postcss";
export default async function compile(content: string, asset: Asset) {
	if (!asset.data) {
		console.error("Compilation Error: Asset's data is empty. Make sure that you're returning a <ParsedAsset> data when parsing.");
		return;
	}

	let fromAST = asset.data.AST.toString();
	let transpiled = await postcss([autoprefixer]).process(fromAST).css;

	let styleContent = "let __styleContent__ = \"\"";
	for (let line of transpiled.split("\n")) {
		// Escape quotes
		line = line.replaceAll("\"", "\\\"");
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
	chunk.append("exports.default = __stylesheet__");

	// TODO: Source map support
	return {
		content: chunk.toString(),
		// Temporarily add a poorly generated source map
		map: chunk.generateMap({
			file: asset.id,
			source: asset.id,
		}),
	};
}
