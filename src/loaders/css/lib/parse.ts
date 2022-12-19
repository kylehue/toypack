import { ParsedAsset } from "@toypack/loaders/types";
import { parse as parseCSS } from "postcss";
import valueParser from "postcss-value-parser";
import { isURL } from "@toypack/utils";
const URL_RE = /url\s*\("?(?![a-z]+:)/;

function parse(content: string | Uint8Array, source: string, options?: any): ParsedAsset {
	if (typeof content != "string") {
		let error = new Error("CSS Parse Error: Content must be string.");
		throw error;
	}

	const AST = parseCSS(content, options?.postCSSOptions);

	const result: ParsedAsset = {
		AST,
		dependencies: [],
	};

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
					if (typeof options?.checkAtRules == "function") {
						options.checkAtRules(node, dependencyId);
					} else {
						node.remove();
					}
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
	});

	return result;
}

export default parse;