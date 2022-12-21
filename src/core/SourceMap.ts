import { getBtoa } from "@toypack/utils";
import mergeSourceMap from "merge-source-map";

export type SourceMapData = {
	version: number;
	sources: string[];
	names: string[];
	mappings: string;
	sourcesContent: string[];
	sourceRoot: string;
	file: string;
	[key: string | number | symbol]: any;
};

export class SourceMap implements SourceMapData {
	public version: number = 3;
	public sources: string[] = [];
	public names: string[] = [];
	public mappings: string = "";
	public sourcesContent: string[] = [];
	public sourceRoot: string = "";
	public file: string = "";

	toComment() {
		return "\n//# sourceMappingURL=" + this.toURL();
	}

	toString() {
		return JSON.stringify(this);
	}

	toBase64() {
		return getBtoa(this.toString());
	}

	toURL() {
		let base64 = this.toBase64();
		return "data:application/json;charset=utf-8;base64," + base64;
	}

	mergeWith(generated: any) {
		let merged = merge(this, generated);

		for (let [key, value] of Object.entries(merged)) {
			(this as SourceMapData)[key] = value;
		}

		return this;
	}
}

export function createSourceMap(sourceMap: any) {
	let generated = new SourceMap();

	for (let [key, value] of Object.entries(sourceMap)) {
		(generated as SourceMapData)[key] = value;
	}

	return generated;
}

export function merge(original: any, generated: any) {
	original = createSourceMap(original);
	generated = createSourceMap(generated);

	let merged = mergeSourceMap(original, generated);

	return createSourceMap(merged);
}
