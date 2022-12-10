import { Asset } from "@toypack/loaders/types";

export default async function compile(content: string, asset: Asset) {
	return {
		map: {},
		content: "",
	};
}
