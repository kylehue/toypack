import { parser as parseHTML } from "posthtml-parser";

type WalkCallback = (node: any) => void;
type ParsedHTML = {
	scripts: Array<string>;
	styles: Array<string>;
	walk: (callback: WalkCallback) => void;
	[key: string | number | symbol]: unknown;
};

export function parse(content: string): ParsedHTML {
	const AST = parseHTML(content);

	const result: ParsedHTML = {
		AST,
		walk: (callback: WalkCallback) => {
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
		},
		scripts: [],
		styles: [],
	};

   // Scan scripts
	result.walk((node) => {
		if (node.tag == "script" && node.attrs?.src) {
			result.scripts.push(node.attrs.src);
		}

		if (
			node.tag == "link" &&
			node.attrs?.href &&
			node.attrs?.rel == "stylesheet"
		) {
			result.styles.push(node.attrs.href);
		}
	});

	return result;
}
