import { ParsedAsset } from "@toypack/loaders/types";

function parse(content: string | Uint8Array, source: string) {
	if (typeof content != "string") {
		let error = new Error("Content must be string.");
		error.stack = "JSON Parse Error: ";
		throw error;
	}

	const result: ParsedAsset = {
		AST: [],
		dependencies: [],
	};

	return result;
}

export default parse;
