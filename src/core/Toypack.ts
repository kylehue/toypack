import {
	ResolveOptions,
	ToypackOptions,
	IAsset,
	ToypackLoader,
	ToypackPlugin,
	BundleOptions,
} from "@toypack/core/types";
import {
	BabelLoader,
	JSONLoader,
	AssetLoader,
	CSSLoader,
	HTMLLoader,
} from "@toypack/loaders";
import {
	AutoImportJSXPragmaPlugin,
	NodePolyfillPlugin,
} from "@toypack/plugins";
import { defaultOptions } from "@toypack/core/options";

import { merge, cloneDeep } from "lodash";

import PackageManager from "./PackageManager";
import resolve from "./resolve";
import bundle from "./bundle";
import { add as addAsset } from "./asset";
import Hooks, { HookName } from "./Hooks";

export const styleExtensions = [".css", ".sass", ".scss", ".less"];
export const appExtensions = [
	".js",
	".json",
	".jsx",
	".ts",
	".tsx",
	".html",
	".vue",
];
// prettier-ignore
export const resourceExtensions = [".png",".jpg",".jpeg",".gif",".svg",".bmp",".tiff",".tif",".woff",".woff2",".ttf",".eot",".otf",".webp",".mp3",".mp4",".wav",".mkv",".m4v",".mov",".avi",".flv",".webm",".flac",".mka",".m4a",".aac",".ogg", ".map"];
export const textExtensions = [...appExtensions, ...styleExtensions];

export default class Toypack {
	public assets: Map<string, IAsset> = new Map();
	public options: ToypackOptions = cloneDeep(defaultOptions);
	public loaders: ToypackLoader[] = [];
	public plugins: ToypackPlugin[] = [];
	public outputSource: string = "";
	public dependencies = {};
	public packageManager: PackageManager;
	public hooks = new Hooks();
	public assetCache: Map<string, IAsset> = new Map();
	public bundleContentURL: string | null = null;
	public bundleContentDocURL: string | null = null;
	constructor(options?: ToypackOptions) {
		if (options) {
			this.defineOptions(options);
		}

		this.packageManager = new PackageManager(this);

		/* Default loaders */
		this.loaders.push(new BabelLoader());
		this.loaders.push(new JSONLoader());
		this.loaders.push(new CSSLoader());
		this.loaders.push(new AssetLoader());
		this.loaders.push(new HTMLLoader());

		/* Default plugins */
		this.use(new NodePolyfillPlugin());
		this.use(new AutoImportJSXPragmaPlugin());

		// Add empty object for fallbacks with no polyfill
		this.addAsset(
			"/node_modules/toypack/empty/index.js",
			"module.exports = {};"
		);
	}

	public async _initHooks(hookName: HookName, ...args) {
		let hooks = this.hooks.taps.get(hookName);
		if (hooks) {
			for (let fn of hooks) {
				await fn(...args);
			}
		}
	}

	/**
	 * Add a plugin.
	 * @param plugin The Toypack plugin.
	 */
	public use(plugin: ToypackPlugin) {
		this.plugins.push(plugin);
		plugin.apply(this);
	}

	/**
	 * Modifies the options for the Toypack instance.
	 *
	 * @param {ToypackOptions} options - Toypack options.
	 */
	public defineOptions(options: ToypackOptions) {
		merge(this.options, options);
	}

	/**
	 * Adds an asset to the bundler.
	 *
	 * @param {string} source - The source path of the asset.
	 * @param {string|ArrayBuffer} [content] - The contents of the asset.
	 * @returns {Promise<Asset>} The asset that was added.
	 */
	public async addAsset(source: string, content: string | ArrayBuffer = "") {
		return await addAsset(this, source, content);
	}

	/**
	 * Resolves a module path to its absolute path.
	 *
	 * @param {string} x - The module path to resolve.
	 * @param {ResolveOptions} [options] - Resolving options.
	 * @returns {string} The absolute path of the module.
	 */
	public resolve(x: string, options?: ResolveOptions) {
		return resolve(this, x, options);
	}

	/**
	 * Bundles the assets starting from the entry point.
	 *
	 * @param {object} [options] - Bundle options.
	 * @returns {Promise<BundleResult>} A bundle result.
	 */
	public async bundle(options?: BundleOptions) {
		return await bundle(this, options);
	}
}
