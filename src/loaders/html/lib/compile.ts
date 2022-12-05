import { Asset, MagicString } from "@toypack/loaders/types";

const HTML_ELEMENT = 1;
export default function compile(chunk: MagicString, asset: Asset) {
	chunk.replace(chunk.toString(), "");
	// Transforms HTML AST into a javascript code and appends it to chunk
	function transformAndAppend(node: any) {
		if (node.nodeType == HTML_ELEMENT) {
			// Instantiate
			chunk.prepend(
				`let ${node.varName} = document.createElement("${node.rawTagName}");\n`
			);

			// Add attributes
			for (let [key, value] of Object.entries(node.attrs)) {
				chunk.append(`\n${node.varName}.setAttribute("${key}", "${value}");`);
			}

			chunk.append(
				`\n${node.parentNode.varName}.appendChild(${node.varName});`
			);
		} else {
			if (!node.isWhitespace) {
				// Instantiate text
				chunk.prepend(
					`let ${node.varName} = document.createTextNode(\`${node.rawText}\`);\n`
				);

				chunk.append(
					`\n${node.parentNode.varName}.appendChild(${node.varName});`
				);
			}
		}
	}

	// Scan, transform, and append head AST and body AST
	asset.data.walk(asset.data.head, (node: any) => {
		if (node != asset.data.head) {
			transformAndAppend(node);
		}
	});

	asset.data.walk(asset.data.body, (node: any) => {
		if (node != asset.data.body) {
			transformAndAppend(node);
		} else {
			// Add body attributes
			for (let [key, value] of Object.entries(node.attrs)) {
				chunk.append(`\n${node.varName}.setAttribute("${key}", "${value}");`);
			}
		}
	});

	// Add head and body element variables
	chunk.prepend(
		`let ${asset.data.body.varName} = document.body || document.getElementsByTagName("body")[0];\n`
	);

	chunk.prepend(
		`let ${asset.data.head.varName} = document.head || document.getElementsByTagName("head")[0];\n`
	);

	// Imports
	for (let dependency in asset.dependencyMap) {
		chunk.prepend(`import "${dependency}";\n`);
	}
	
	// Export
	chunk.append(
		`\nexport {${asset.data.head.varName} as head, ${asset.data.body.varName} as body};`
	);

	return chunk;
}
