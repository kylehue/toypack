import mergeSourceMap from "merge-source-map";

interface SourceMap {
	version: number;
	sources: string[];
	names: string[];
	mappings: string;
	sourcesContent: string[];
	sourceRoot: string;
	file: string;
	[key: string | number | symbol]: unknown;
}

class SourceMap implements SourceMap {
	constructor() {
		this.version = 3;
		this.sources = [];
		this.names = [];
		this.mappings = "";
		this.sourcesContent = [];
		this.sourceRoot = "";
		this.file = "";
	}

	toComment() {
		return "\n//# sourceMappingURL=" + this.toURL();
	}

	toString() {
		return JSON.stringify(this);
	}

	toBase64() {
		let buffer = Buffer.from(this.toString());
		return buffer.toString("base64");
	}

	toURL() {
		let base64 = this.toBase64();
		return "data:application/json;charset=utf-8;base64," + base64;
	}

	mergeTo(generated: any) {
		let merged = merge(this, generated);

		for (let [key, value] of Object.entries(merged)) {
			this[key as keyof SourceMap] = value;
		}
	}
}

export function generateFrom(sourceMap: any) {
	let generated = new SourceMap();

	for (let [key, value] of Object.entries(sourceMap)) {
		generated[key as keyof SourceMap] = value;
	}

	return generated;
}

export function merge(original: any, generated: any) {
	original = generateFrom(original);
	generated = generateFrom(generated);

	let merged = mergeSourceMap(original, generated);

	return generateFrom(merged);
}
