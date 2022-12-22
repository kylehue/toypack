import MagicString from "magic-string";
import { AcceptedPlugin, ProcessOptions } from "postcss";
import { SourceMap } from "./SourceMap";
import Toypack from "./Toypack";

export interface ResolveOptions {
	baseDir?: string;
	includeCoreModules?: boolean;
	extensions?: string[];
}

export interface OutputOptions {
	/**
	 * The output directory of the bundle.
	 */
	path: string;
	/**
	 * The output filename of the bundle.
	 */
	filename: string;
	/**
	 * - Set to `true` to generate a sourcemap and append it in the bundle content as a data URL.
	 */
	sourceMap?: boolean;
	/**
	 * The name of your library.
	 */
	name?: string;
	asset: "inline" | "external";
	assetFilename: string;
}

export interface BundleOptions {
	mode?: "development" | "production";
	entry: string;
	output: OutputOptions;
}

export interface PostCSSOptions {
	plugins: AcceptedPlugin[];
	options: ProcessOptions;
}

export interface ToypackOptions {
	bundleOptions: BundleOptions;
	postCSSOptions: PostCSSOptions;
}

interface LoaderData {
	compile: CompiledAsset;
	parse: ParsedAsset;
}

export interface AssetInterface {
	id: number;
	name: string;
	source: string;
	content: string | ArrayBuffer;
	type: string;
	extension: string;
	loader: Loader;
	loaderData: LoaderData;
	dependencyMap: Object;
	contentURL: string;
	blob: Blob;
}

export interface ParsedAsset {
	dependencies: string[];
	metadata?: any;
}

export interface CompiledAsset {
	content: MagicString;
	map?: SourceMap;
	metadata?: any;
}

export interface Loader {
	bundler?: Toypack;
	name: string;
	test: RegExp;
	parse?: (
		asset: AssetInterface,
		bundler: Toypack,
		options?: any
	) => ParsedAsset | Promise<ParsedAsset>;
	compile?: (
		asset: AssetInterface,
		bundler: Toypack,
		options?: any
	) => CompiledAsset | Promise<CompiledAsset>;
}

export interface BundleResult {
	content: string;
	contentURL: string | null;
	contentDocURL: string | null;
}
