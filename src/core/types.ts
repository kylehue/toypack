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
type SourceMapOptionsQuality = "cheap" | "hires";
type SourceMapOptionsSources = "nosources" | "sources";
type SourceMapOptions =
	| `${SourceMapOptionsOutput}-${SourceMapOptionsQuality}-${SourceMapOptionsSources}`
	| false;

export interface OutputOptions {
	/**
	 * The output directory of the bundle.
	 * @default `dist`
	 */
	path?: string;
	/**
	 * The filename of the bundle.
	 * @default `[name][ext]`
	 */
	filename?: string;
	/**
	 * - `inline-*-*` - Appended directly to the code as a data URL, allowing the source map to be accessed without an additional file.
	 * - `external-*-*` - Stored in a separate file and referenced by the compiled code.
	 * - `*-hires-*` - Map both lines and columns of code, providing a more detailed and accurate representation of the original source code.
	 * - `*-cheap-*` - Less detailed source map. Resulting in a smaller and faster bundle.
	 * - `*-*-nosources` - No source code is included. This results in a smaller source map file, but may make debugging more difficult.
	 * - `*-*-sources` - Opposite of `*-*-nosources`.
	 * - Set to `false` to disable.
	 *
	 * **Note:** Becomes `false` when in production mode.
	 * @default `inline-cheap-sources`
	 */
	sourceMap?: SourceMapOptions;
	/**
	 * The name of your library.
	 */
	name?: string;
	/**
	 * - Set to `inline` to append directly to the code as a data URL.
	 * - Set to `external` to save as an external resource.
	 * @default `external`
	 */
	resourceType?: "inline" | "external";
	/**
	 * The filename of the assets.
	 * @default `[name][ext]`
	 */
	assetFilename?: string;
}

export interface BundleOptions {
	/**
	 * - `development` - Optimized for a fast and flexible workflow during the development process.
	 *
	 * - `production` - Optimized for performance and efficiency in a live production environment.
	 * @default `development`
	 */
	mode?: "development" | "production";
	/**
	 * The starting point of the bundle.
	 * @default `/`
	 */
	entry?: string;
	/**
	 * Output options.
	 */
	output?: OutputOptions;
	/**
	 * Toypack plugins.
	 */
	plugins?: ToypackPlugin[];
	/**
	 * Configure how modules are resolved.
	 */
	resolve?: ModuleResolveOptions;
	/**
	 * When this option is enabled, Toypack will output detailed log messages to the console.
	 * @default true
	 */
	logs?: boolean;
}

export interface ModuleResolveOptions {
	/**
	 * Create aliases to import or require certain modules more easily.
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
	 * Redirect module requests when normal resolving fails.
	 */
	fallback?: Object;
	/**
	 * [".js", ".json"]
	 *
	 * Attempt to resolve the extensions provided in order.
	 * @default
	 */
	extensions?: string[];
}

export interface PostCSSOptions {
	/**
	 * PostCSS plugins.
	 */
	plugins?: AcceptedPlugin[];
	/**
	 * PostCSS processing options.
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
	 * The package provider.
	 * @default `esm.sh`
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
