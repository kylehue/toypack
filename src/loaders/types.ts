import { SourceMapData } from "@toypack/core/SourceMap";
export type ParsedAsset = {
	AST: any;
	dependencies: Array<string>;
	metadata?: any;
	head?: any;
	body?: any;
	[key: string | number | symbol]: unknown;
};

export type Asset = {
	id: string | number;
	source: string;
	content: string | Uint8Array;
	type: string;
	loader: Loader;
	data?: ParsedAsset;
	dependencyMap?: any;
	contentURL?: string;
	compilationData?: any;
	skippable?: boolean;
	blob: Blob;
};

type CompiledAsset = {
	content: string;
	map: SourceMapData;
};

type LoaderMethod = {
	compile: (content: string, asset: Asset) => Promise<CompiledAsset>;
	parse: (content: string, source: string) => ParsedAsset;
};

export type Loader = {
	name: string;
	test: RegExp;
	use: LoaderMethod;
};