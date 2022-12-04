export type ParsedAsset = {
	AST: any;
	dependencies: Array<string>;
	head?: any;
	body?: any;
	walk?: any;
	[key: string | number | symbol]: unknown;
};

export type Asset = {
	data: ParsedAsset;
	id: string;
	loader: Loader;
	content: string;
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

export type Loader = {
	compile: (content: MagicString, asset: Asset) => void;
	parse: (content: string) => ParsedAsset;
};