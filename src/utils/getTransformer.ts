type Transformer = "html" | "js";

type Transformers = {
	[key in Transformer]: () => Promise<any>;
}

const builtInTransformers: Transformers = {
	async html() {
		return await import("@toypack/transformers/HTMLTransformer");
	},
	async js() {
		return await import("@toypack/transformers/JSTransformer");
	},
};

export default async function getTransformer(type: Transformer) {
	let transformer = builtInTransformers[type];

	if (typeof transformer == "function") {
		return await transformer();
	}
}
