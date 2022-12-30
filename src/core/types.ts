import MagicString from "magic-string";
import { AcceptedPlugin, ProcessOptions } from "postcss";
import SourceMap from "./SourceMap";
import Toypack from "./Toypack";
import { TransformOptions } from "@babel/core";
import { PackageProvider } from "./PackageManager";

export interface ResolveOptions {
	baseDir?: string;
	includeCoreModules?: boolean;
	extensions?: string[];
}

type SourceMapOptionsOutput = "inline" | "external";
type SourceMapOptionsQuality = "cheap" | "original";
type SourceMapOptionsSources = "nosources" | "sources";
type SourceMapOptions =
	| `${SourceMapOptionsOutput}-${SourceMapOptionsQuality}-${SourceMapOptionsSources}`
	| false;

export interface OutputOptions {
	/**
	 * @default `dist`
	 * @desc The output directory of the bundle.
	 */
	path?: string;
	/**
	 * @default `[name][ext]`
	 * @desc The filename of the bundle.
	 */
	filename?: string;
	/**
	 * @default `inline-cheap-sources`
	 *
	 * @desc
	 * - `inline-*-*` - Appended directly to the code as a data URL, allowing the source map to be accessed without an additional file.
	 * - `external-*-*` - Stored in a separate file and referenced by the compiled code.
	 * - `*-cheap-*` - Only map the lines of code, rather than the specific columns, resulting in a smaller and less detailed source map.
	 * - `*-original-*` - Map both lines and columns of code, providing a more detailed and accurate representation of the original source code.
	 * - `*-*-nosources` - No source code is included. This results in a smaller source map file, but may make debugging more difficult.
	 * - `*-*-sources` - Opposite of `*-*-nosources`.
	 * - Set to `false` to disable.
	 *
	 * **Note:** Becomes `false` when in production mode.
	 */
	sourceMap?: SourceMapOptions;
	/**
	 * @desc The name of your library.
	 */
	name?: string;
	/**
	 * @default `external`
	 * @desc
	 * - Set to `inline` to append directly to the code as a data URL.
	 * - Set to `external` to save as an external resource.
	 */
	asset?: "inline" | "external";
	/**
	 * @default `[name][ext]`
	 * @desc The filename of the assets.
	 */
	assetFilename?: string;
}

export interface BundleOptions {
	/**
	 * @default `development`
	 *
	 * @desc
	 * - `development` - Optimized for a fast and flexible workflow during the development process.
	 *
	 * - `production` - Optimized for performance and efficiency in a live production environment.
	 */
	mode?: "development" | "production";
	/**
	 * @default `/`
	 * @desc The starting point of the bundle.
	 */
	entry?: string;
	/**
	 * @desc Output options.
	 */
	output?: OutputOptions;
	/**
	 * @desc Toypack plugins.
	 */
	plugins?: ToypackPlugin[];
	/**
	 * @desc Configure how modules are resolved.
	 */
	resolve?: ModuleResolveOptions;
	/**
	 * @desc When this option is enabled, Toypack will output detailed log messages to the console.
	 */
	logs?: boolean;
}

export interface ModuleResolveOptions {
	/**
	 * @desc Create aliases to import or require certain modules more easily.
	 * @example
	 * {
	 * 	alias: {
	 * 		"@classes": "src/classes/"
	 * 	}
	 * }
	 *
	 * // Now instead of importing modules like this:
	 * import Book from "../classes/Book.js";
	 *
	 * // You can import modules like this:
	 * import Book from "@classes/Book.js";
	 */
	alias?: Object;
	/**
	 * @desc Redirect module requests when normal resolving fails.
	 */
	fallback?: Object;
	/**
	 * @default
	 * [".js", ".json"]
	 *
	 * @desc Attempt to resolve the extensions provided in order.
	 */
	extensions?: string[];
}

export interface PostCSSOptions {
	/**
	 * @desc PostCSS plugins.
	 */
	plugins?: AcceptedPlugin[];
	/**
	 * @desc PostCSS processing options.
	 */
	options?: ProcessOptions;
}

export interface ToypackOptions {
	/**
	 * Bundle options.
	 */
	bundleOptions?: BundleOptions;
	/**
	 * PostCSS options.
	 */
	postCSSOptions?: PostCSSOptions;
	/**
	 * @default `esm.sh`
	 * @desc The package provider.
	 */
	packageProvider?: PackageProvider;
}

interface LoaderData {
	compile: CompiledAsset | null;
	parse: ParsedAsset | null;
}

export interface AssetInterface {
	id: number;
	name: string;
	source: string;
	content: string | ArrayBuffer;
	type: string;
	extension: string;
	loader: ToypackLoader;
	loaderData: LoaderData;
	dependencyMap: Object;
	contentURL: string;
	isObscure: boolean;
	isModified: boolean;
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

export interface ToypackLoader {
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

export interface ToypackPlugin {
	options?: Object;
	_applied?: boolean;
	apply: (compiler: Toypack) => void | Promise<void>;
}

export interface BundleResult {
	content: string;
	contentURL: string | null;
	contentDoc: string | null;
	contentDocURL: string | null;
}
