import { Asset } from "@toypack/loaders/types";
import { walk } from "./parse";
import MagicString from "magic-string";
import { BUNDLE_CONFIG } from "@toypack/core/Toypack";

const HTML_ELEMENT = 1;
async function compile(content: string | Uint8Array, asset: Asset) {
	if (typeof content != "string") {
		let error = new Error("HTML Compile Error: Content must be string.");
		throw error;
	}

	if (!asset.data) {
		let error = new Error(
			"HTML Compile Error: Asset's data is empty."
		);
		throw error;
	}

	let chunk = new MagicString(content);

	chunk.replace(chunk.toString(), "");
	// Transforms HTML AST into a javascript code and appends it to chunk
	function transformAndAppend(node: any) {
		if (node.nodeType == HTML_ELEMENT) {
			// Instantiate
			chunk.prepend(
				`let ${node.id} = document.createElement("${node.rawTagName}");\n`
			);

			// Add attributes
			for (let [key, value] of Object.entries(node.attrs)) {
				chunk.append(`\n${node.id}.setAttribute("${key}", "${value}");`);
			}

			chunk.append(`\n${node.parentNode.id}.appendChild(${node.id});`);
		} else {
			if (!node.isWhitespace) {
				// Instantiate text
				let textNodeCode = `"".concat(\"${node.rawText
					.split("\n")
					.join('").concat("')}\")`;
				chunk.prepend(
					`let ${node.id} = document.createTextNode(${textNodeCode});\n`
				);

				chunk.append(`\n${node.parentNode.id}.appendChild(${node.id});`);
			}
		}
	}

	// Scan, transform, and append head AST and body AST
	walk(asset.data.metadata.head, (node: any) => {
		if (node != asset.data?.metadata.head) {
			transformAndAppend(node);
		}
	});

	walk(asset.data.metadata.body, (node: any) => {
		if (node != asset.data?.metadata.body) {
			transformAndAppend(node);
		} else {
			// Add body attributes
			for (let [key, value] of Object.entries(node.attrs)) {
				chunk.append(`\n${node.id}.setAttribute("${key}", "${value}");`);
			}
		}
	});

	// Add head and body element variables
	chunk.prepend(
		`let ${asset.data.metadata.body.id} = document.body || document.getElementsByTagName("body")[0];\n`
	);

	chunk.prepend(
		`let ${asset.data.metadata.head.id} = document.head || document.getElementsByTagName("head")[0];\n`
	);

	// Imports
	for (let dependency in asset.dependencyMap) {
		chunk.prepend(`require("${dependency}");\n`);
	}

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