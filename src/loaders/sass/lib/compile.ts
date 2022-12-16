import { Asset } from "@toypack/loaders/types";

export default async function compile(
	content: string | Uint8Array,
	asset: Asset
) {
	if (typeof content != "string") {
		let error = new Error("Content must be string.");
		error.stack = "Sass Compile Error: ";
		throw error;
	}

	return {
		map: {},
		content: "",
	};
}
