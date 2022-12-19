import { Asset } from "@toypack/loaders/types";
import MagicString from "magic-string";
import autoprefixer from "autoprefixer";
import postcss from "postcss";
import { BUNDLE_CONFIG } from "@toypack/core/Toypack";
import { isURL } from "@toypack/utils";
async function compile(content: string | Uint8Array, asset: Asset, options?: any) {
	if (typeof content != "string") {
		let error = new Error("CSS Compile Error: Content must be string.");
		throw error;
	}

	let chunkContent =
		options?.useContent || isURL(asset.source)
			? content
			: asset.data?.AST.toString();

	if (!isURL(asset.source)) {
		chunkContent = await postcss([autoprefixer]).process(chunkContent).css;
	}

	let styleContent = 'let __styleContent__ = ""';
	for (let line of chunkContent.split("\n")) {
		// Escape quotes
		line = line.replaceAll('"', '\\"');
		styleContent += `.concat("${line}")`;
	}

	let chunk = new MagicString(content);

	// For dummy source map
	chunk.update(0, chunk.length(), styleContent);

	chunk.append(
		`
let __head__ = document.head || document.getElementsByTagName("head")[0];
__stylesheet__ = document.createElement("style");
__stylesheet__.dataset.toypackId = "asset-${asset.id}";
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

	chunk.prepend(
		`let __stylesheet__ = document.querySelector("[data-toypack-id~='asset-${asset.id}']");`
	);

	// Imports
	for (let dependency in asset.dependencyMap) {
		chunk.prepend(`require("${dependency}");\n`);
	}

	// Exports
	chunk.append("module.exports = __stylesheet__");

	// TODO: Source map support
	return {
		content: chunk.toString(),
		// Temporarily add a poorly generated source map
		map: BUNDLE_CONFIG.output.sourceMap
			? chunk.generateMap({
					file: asset.source,
					source: asset.source,
					includeContent: false,
					hires: false,
			  })
			: {},
	};
}

export default compile;