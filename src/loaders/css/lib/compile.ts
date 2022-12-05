import { Asset, MagicString } from "@toypack/loaders/types";
import autoprefixer from "autoprefixer";
import postcss from "postcss";
export default function compile(content: MagicString, asset: Asset) {
	let fromAST = asset.data.AST.toString();
	let processedContent = postcss([autoprefixer]).process(fromAST).css;
	content.update(0, content.length(), processedContent);

	content
		.prepend("let __styleContent__ = `")
		.append("`;\n")
		.append(
			`
let __head__ = document.head || document.getElementsByTagName("head")[0];
let __stylesheet__ = document.createElement("style");
__stylesheet__.dataset.toypackId = "${asset.id}";
__stylesheet__.setAttribute("type", "text/css");
__head__.appendChild(__stylesheet__);

if (__stylesheet__.styleSheet){
  __stylesheet__.styleSheet.cssText = __styleContent__;
} else {
  __stylesheet__.appendChild(document.createTextNode(__styleContent__));
}

export default __stylesheet__;
`
		);
      // Avoid style duplicates
		/* .indent("\t")
		.prepend(
			`if (!document.querySelectorAll("[data-toypack-id~='${asset.id}']").length) {\n`
		)
		.append("\n}"); */

	return content;
}
