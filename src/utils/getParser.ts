export type Parser = "html" | "js";

type Parsers = {
	[key in Parser]: () => Promise<any>;
};

const builtInParsers: Parsers = {
	async html() {
		return await import("@toypack/parsers/HTMLParser");
	},
	async js() {
		return await import("@toypack/parsers/JSParser");
	},
};

export default async function getParser(type: any) {
	let Parser = builtInParsers[type as keyof Parsers];

	if (typeof Parser == "function") {
		return await Parser();
	}
}
