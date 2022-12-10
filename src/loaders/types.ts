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
	id: string;
	content: string;
	type: "module" | "stylesheet";
	data?: ParsedAsset;
	loader?: Loader;
	dependencyMap?: any;
	contentURL?: string;
	compilationData?: any;
	skippable?: boolean;
};

export type MagicString = {
	addSourcemapLocation: (index: number) => void;
	trimLines: () => MagicString;
	trim: (charType: RegExp | string) => MagicString;
	trimEnd: (charType: RegExp | string) => MagicString;
	trimStart: (charType: RegExp | string) => MagicString;
	toString: () => string;
	slice: (start: number, end: number) => void;
	snip: (start: number, end: number) => void;
	remove: (start: number, end: number) => MagicString;
	move: (start: number, end: number, index: number) => MagicString;
	update: (start: number, end: number, content: string) => MagicString;
	append: (content: string) => MagicString;
	appendLeft: (index: number, content: string) => MagicString;
	appendRight: (index: number, content: string) => MagicString;
	prepend: (content: string) => MagicString;
	prependLeft: (index: number, content: string) => MagicString;
	prependRight: (index: number, content: string) => MagicString;
	replace: (loc: RegExp | string, substitution: string) => MagicString;
	replaceAll: (loc: RegExp | string, substitution: string) => MagicString;
	clone: () => MagicString;
	generateDecodedMap: (options: object) => object;
	generateMap: (options: object) => object;
	hasChanged: () => boolean;
	isEmpty: () => boolean;
	indent: (prefix: string, options?: object) => MagicString;
	length: () => number;
	overwrite: (
		start: number,
		end: number,
		content: string,
		options?: object
	) => MagicString;
	[key: string | number | symbol]: unknown;
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