import { ParsedAsset } from "@toypack/loaders/types";
import { parse as parseCSS } from "postcss";
import valueParser from "postcss-value-parser";
const URL_RE = /url\s*\("?(?![a-z]+:)/;

export default function parse(content: string): ParsedAsset {
	const AST = parseCSS(content);

	const result: ParsedAsset = {
		AST,
		dependencies: [],
	};

	// Get dependencies that is using `@import`
	AST.walkAtRules((node: any) => {
		if (node.name == "import") {
			let parsedValue = valueParser(node.params);
			parsedValue.walk((valueNode: any) => {
				let id: any = null;
				if (
					valueNode.type == "function" &&
					valueNode.value == "url" &&
					valueNode.nodes.length
				) {
					id = valueNode.nodes[0]?.value;
				} else if (valueNode.value && !valueNode.nodes?.length) {
					id = valueNode.value;
				}

				if (id) {
					result.dependencies.push(id);

					// Remove from AST
					node.remove();
				}
			});
		}
	});

	// TODO: Add asset loader or create object url
	// Get dependencies that is using `url()`
	AST.walkDecls((node: any) => {
		const isURL = URL_RE.test(node.value);
		if (isURL) {
			let parsedValue = valueParser(node.value);
			parsedValue.walk((valueNode: any) => {
				if (
					valueNode.type === "function" &&
					valueNode.value === "url" &&
					valueNode.nodes.length &&
					!valueNode.nodes[0].value.startsWith("#")
				) {
					result.dependencies.push(valueNode.nodes[0]?.value);
				}
			});
		}
	});

	return result;
}
