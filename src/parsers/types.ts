export type ParsedAsset = {
	dependencies: Array<string>;
	[key: string | number | symbol]: unknown;
};
