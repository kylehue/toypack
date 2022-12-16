import { ParsedAsset } from "@toypack/loaders/types";

function parse(content: string | Uint8Array, source: string) {
	const result: ParsedAsset = {
		AST: [],
		dependencies: [],
	};

	return result;
}

export default parse;