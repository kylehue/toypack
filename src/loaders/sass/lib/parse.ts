import { ParsedAsset } from "@toypack/loaders/types";

export default function parse(content: string | Uint8Array, source: string) {
	if (typeof content != "string") {
		let error = new Error("Content must be string.");
		error.stack = "Sass Parse Error: ";
		throw error;
	}

	const result: ParsedAsset = {
		AST: [],
		dependencies: [],
	};

	return result;
}
