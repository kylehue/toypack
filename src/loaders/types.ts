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
	blob: Blob;
	data?: ParsedAsset;
	dependencyMap?: any;
	contentURL?: string;
	compilationData?: any;
	skippable?: boolean;
};

export type CompiledAsset = {
	content: string;
	map: SourceMapData;
};

type LoaderMethod = {
	compile: (
		content: string | Uint8Array,
		asset: Asset,
		options?: any
	) => Promise<CompiledAsset>;
	parse: (content: string, source: string, options?: any) => ParsedAsset;
};

export type Loader = {
	name: string;
	test: RegExp;
	use: LoaderMethod;
};