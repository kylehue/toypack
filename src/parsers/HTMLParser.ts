import { parser as parseHTML } from "posthtml-parser";

type WalkCallback = (node: any) => void;
type ParsedHTML = {
	dependencies: Array<string>;
	[key: string | number | symbol]: unknown;
};

function walk(AST: any, callback: WalkCallback) {
	function traverse(_AST: any) {
		for (let node of _AST) {
			if (typeof node == "object" && !Array.isArray(node)) {
				callback(node);
				if (node.content?.length) {
					traverse(node.content);
				}
			}
		}
	}

	traverse(AST);
};

export function parse(content: string): ParsedHTML {
	const AST = parseHTML(content);

	const result: ParsedHTML = {
		AST,
		dependencies: []
	};

   // Scan dependencies
	walk(AST, (node) => {
		// Scripts
		if (node.tag == "script" && node.attrs?.src) {
			result.dependencies.push(node.attrs.src);
		}

		// Styles
		if (
			node.tag == "link" &&
			node.attrs?.href &&
			node.attrs?.rel == "stylesheet"
		) {
			result.dependencies.push(node.attrs.href);
		}
	});

	return result;
}
