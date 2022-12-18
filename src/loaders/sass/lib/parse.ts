import { ParsedAsset } from "@toypack/loaders/types";

export default function parse(content: string | Uint8Array, source: string) {
	if (typeof content != "string") {
		let error = new Error("Content must be string.");
		error.stack = "Sass Parse Error: ";
		throw error;
	}

	/* No need to do anything here since the Sass compiler already packs the dependencies of a Sass file into one */
	
	const result: ParsedAsset = {
		AST: [],
		dependencies: [],
	};

	return result;
}
