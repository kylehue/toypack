import { SourceMapData } from "./SourceMap";
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
	/**
	 * Whether to add object URLs in the bundle output or not. This is useful if you want to use the bundle in an <iframe>.
	 */
	contentURL?: boolean;
}

export interface BundleOptions {
	mode?: "development" | "production";
	entry: string;
	output: OutputOptions;
}

export interface ToypackOptions {
	bundleOptions: BundleOptions;
}

interface LoaderData {
	compile: CompiledAsset;
	parse: ParsedAsset;
}

export interface AssetInterface {
	id: number;
	source: string;
	content: string | ArrayBuffer;
	type: string;
	extension: string;
	loader: Loader;
	loaderData: LoaderData;
	dependencyMap: Object;
	contentURL?: string;
	blob?: Blob;
}

export interface ParsedAsset {
	dependencies: string[];
	metadata?: any;
}

export interface CompiledAsset {
	content: string;
	map: SourceMapData;
	metadata?: any;
}

export interface Loader {
	bundler?: Toypack;
	name: string;
	test: RegExp;
	parse?: (asset: AssetInterface, bundler: Toypack) => ParsedAsset;
	compile?: (
		asset: AssetInterface,
		bundler: Toypack
	) => CompiledAsset;
}