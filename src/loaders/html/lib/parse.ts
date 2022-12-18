import { ParsedAsset } from "@toypack/loaders/types";
import { isURL } from "@toypack/utils";
import { join } from "path";
import { parse as parseHTML } from "node-html-parser";
type WalkCallback = (node: any) => void;
export function walk(AST: any, callback: WalkCallback) {
	function traverse(tree: any) {
		for (let node of tree) {
			if (typeof node == "object") {
				callback(node);
				if (node.childNodes?.length) {
					traverse(node.childNodes);
				}
			}
		}
	}

	callback(AST);
	traverse(AST.childNodes);
}

function parse(content: string | Uint8Array, source: string): ParsedAsset {
	if (typeof content != "string") {
		let error = new Error("Content must be string.");
		error.stack = "HTML Parse Error: ";
		throw error;
	}

	const AST = parseHTML(content);

	const result: ParsedAsset = {
		AST,
		dependencies: [],
		metadata: {},
	};

	function addToDependencies(id: string) {
		// If path is not an external url, make sure the path starts from root
		// This avoids the resolver from searching in core modules
		if (!isURL(id)) {
			id = join("/", id);
		}

		result.dependencies.push(id);
	}

	let _ID = 0;
	// Scan dependencies
	walk(AST, (node: any) => {
		// Scripts
		if (node.tagName == "SCRIPT" && node.attrs?.src) {
			addToDependencies(node.attrs?.src);

			// Remove from tree
			node.remove();
		}

		// Styles
		if (node.tagName == "LINK" && node.attrs?.rel == "stylesheet") {
			addToDependencies(node.attrs?.href);

			// Remove from tree
			node.remove();
		}

		// TODO: <a> tag href dependencies?

		// Get body tag
		if (node.tagName == "BODY") {
			result.metadata.body = node;
		}

		// Get head tag
		if (node.tagName == "HEAD") {
			result.metadata.head = node;
		}

		// Assign a unique id for each node (will be used in compilation)
		node.id = `__node_${++_ID}__`;
	});

	return result;
}

export default parse;