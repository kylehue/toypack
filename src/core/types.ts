import MagicString from "magic-string";
import { AcceptedPlugin, ProcessOptions } from "postcss";
import { SourceMap } from "./SourceMap";
import Toypack from "./Toypack";

export interface ResolveOptions {
	baseDir?: string;
	includeCoreModules?: boolean;
	extensions?: string[];
}

type SourceMapOptionsOutput = "inline" | "external";
type SourceMapOptionsQuality = "cheap" | "original";
type SourceMapOptionsSources = "nosources" | "sources";
type SourceMapOptions = `${SourceMapOptionsOutput}-${SourceMapOptionsQuality}-${SourceMapOptionsSources}` | false;

export interface OutputOptions {
	/**
	 * Default: `dist`
	 * - The output directory of the bundle.
	 */
	path: string;
	/**
	 * Default: `[name][ext]`
	 * - The filename of the bundle.
	 */
	filename: string;
	/**
	 * Default: `inline-cheap-sources`
	 * - `inline-*-*` - Appended directly to the code as a data URL, allowing the source map to be accessed without an additional file.
	 * - `external-*-*` - Stored in a separate file and referenced by the compiled code.
	 * - `*-cheap-*` - Only map the lines of code, rather than the specific columns, resulting in a smaller and less detailed source map.
	 * - `*-original-*` - Map both lines and columns of code, providing a more detailed and accurate representation of the original source code.
	 * - `*-*-nosources` - No source code is included. This results in a smaller source map file, but may make debugging more difficult.
	 * - `*-*-sources` - Opposite of `*-*-nosources`.
	 * - Set to `false` to disable.
	 */
	sourceMap?: SourceMapOptions;
	/**
	 * - The name of your library.
	 */
	name?: string;
	/**
	 * Default: `external`
	 * - Set to `inline` to append directly to the code as a data URL.
	 * - Set to `external` to save as an external resource.
	 */
	asset: "inline" | "external";
	/**
	 * Default: `[name][ext]`
	 * - The filename of the assets.
	 */
	assetFilename: string;
}

export interface BundleOptions {
	/**
	 * Default: `development`
	 * - `development` - Optimized for a fast and flexible workflow during the development process.
	 * - `production` - Optimized for performance and efficiency in a live production environment.
	 */
	mode?: "development" | "production";
	/**
	 * Default: `/`
	 * - The starting point of the bundle.
	 */
	entry: string;
	/**
	 * Output options.
	 */
	output: OutputOptions;
}

export interface PostCSSOptions {
	/**
	 * Default: `[autoprefixer]`
	 * - PostCSS plugins.
	 */
	plugins: AcceptedPlugin[];
	/**
	 * - PostCSS processing options.
	 */
	options: ProcessOptions;
}

export interface ToypackOptions {
	/**
	 * Bundle options.
	 */
	bundleOptions: BundleOptions;
	/**
	 * PostCSS options.
	 */
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
