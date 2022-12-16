import { ParsedAsset } from "@toypack/loaders/types";
import { parse as parseCSS } from "postcss";
import valueParser from "postcss-value-parser";
import { isURL } from "@toypack/utils";
const URL_RE = /url\s*\("?(?![a-z]+:)/;

function parse(content: string | Uint8Array, source: string): ParsedAsset {
	if (typeof content != "string") {
		let error = new Error("Content must be string.");
		error.stack = "CSS Parse Error: ";
		throw error;
	}

	const AST = parseCSS(content);

	const result: ParsedAsset = {
		AST,
		dependencies: [],
	};

	let lastId = 0;
	AST.walk((node: any) => {
		if (node.type == "atrule" && node.name == "import") {
			let parsedValue = valueParser(node.params);
			parsedValue.walk((valueNode: any) => {
				let dependencyId: any = null;
				if (
					valueNode.type == "function" &&
					valueNode.value == "url" &&
					valueNode.nodes.length
				) {
					dependencyId = valueNode.nodes[0]?.value;
				} else if (valueNode.value && !valueNode.nodes?.length) {
					dependencyId = valueNode.value;
				}

				if (dependencyId) {
					result.dependencies.push(dependencyId);

					// Remove from AST
					node.remove();
				}
			});
		} else if (node.type == "decl") {
			const isURLFunction = URL_RE.test(node.value);
			if (isURLFunction) {
				let parsedValue = valueParser(node.value);
				parsedValue.walk((valueNode: any) => {
					if (
						valueNode.type === "function" &&
						valueNode.value === "url" &&
						valueNode.nodes.length &&
						!valueNode.nodes[0].value.startsWith("#")
					) {
						let assetId = valueNode.nodes[0]?.value;
						// TODO: Add asset loader
						if (!assetId.startsWith("data:")) {
							result.dependencies.push(assetId);
						}
					}
				});
			}
		}

		// Add unique id for each node (will be useful on compilation)
		node.id = `__toypack_node_${++lastId}__`;
	});

	return result;
}

export default parse;