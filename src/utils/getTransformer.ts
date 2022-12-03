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

export default async function getTransformer(type: any) {
	let transformer = builtInTransformers[type as keyof Transformers];

	if (typeof transformer == "function") {
		return await transformer();
	}
}
