import { Asset } from "@toypack/loaders/types";
import MagicString from "magic-string";

const HTML_ELEMENT = 1;
export default async function compile(content: string, asset: Asset) {
	if (!asset.data) {
		console.error(
			"Compilation Error: Asset's data is empty. Make sure that you're returning a <ParsedAsset> data when parsing."
		);
		return;
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
				chunk.prepend(
					`let ${node.id} = document.createTextNode(\`${node.rawText}\`);\n`
				);

				chunk.append(`\n${node.parentNode.id}.appendChild(${node.id});`);
			}
		}
	}

	// Scan, transform, and append head AST and body AST
	asset.data.walk(asset.data.head, (node: any) => {
		if (node != asset.data?.head) {
			transformAndAppend(node);
		}
	});

	asset.data.walk(asset.data.body, (node: any) => {
		if (node != asset.data?.body) {
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
		`let ${asset.data.body.id} = document.body || document.getElementsByTagName("body")[0];\n`
	);

	chunk.prepend(
		`let ${asset.data.head.id} = document.head || document.getElementsByTagName("head")[0];\n`
	);

	// Imports
	for (let dependency in asset.dependencyMap) {
		chunk.prepend(`require("${dependency}");\n`);
	}

	// TODO: Source map support
	return {
		content: chunk.toString(),
		// Temporarily add a poorly generated source map
		map: chunk.generateMap({
			file: asset.id,
			includeContent: true,
			source: asset.id,
			hires: true,
		}),
	};
}
