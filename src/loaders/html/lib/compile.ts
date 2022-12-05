import { Asset, MagicString } from "@toypack/loaders/types";

const HTML_ELEMENT = 1;
export default function compile(content: MagicString, asset: Asset) {
	content.update(0, content.length(), "");

	// Transforms HTML AST into a javascript code and appends it to content
	function transformAndAppend(node: any) {
		if (node.nodeType == HTML_ELEMENT) {
			// Instantiate
			content.prepend(
				`let ${node.varName} = document.createElement("${node.rawTagName}");\n`
			);

			// Add attributes
			for (let [key, value] of Object.entries(node.attrs)) {
				content.append(`\n${node.varName}.setAttribute("${key}", "${value}");`);
			}

			content.append(
				`\n${node.parentNode.varName}.appendChild(${node.varName});`
			);
		} else {
			if (!node.isWhitespace) {
				// Instantiate text
				content.prepend(
					`let ${node.varName} = document.createTextNode(\`${node.rawText}\`);\n`
				);

				content.append(
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
				content.append(`\n${node.varName}.setAttribute("${key}", "${value}");`);
			}
		}
	});

	// Add head and body element variables
	content.prepend(
		`let ${asset.data.body.varName} = document.body || document.getElementsByTagName("body")[0];\n`
	);

	content.prepend(
		`let ${asset.data.head.varName} = document.head || document.getElementsByTagName("head")[0];\n`
	);
	
	// Export
	content.append(
		`\nexport {${asset.data.head.varName} as head, ${asset.data.body.varName} as body};`
	);

	return content;
}
