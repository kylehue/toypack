import {
	ResolveOptions,
	ToypackOptions,
	AssetInterface,
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
import { NodePolyfillPlugin } from "@toypack/plugins";
import { defaultOptions } from "@toypack/core/options";

import {
	merge,
	cloneDeep,
} from "lodash";

import PackageManager from "./PackageManager";
import resolve from "./resolve";
import bundle from "./bundle";
import { add as addAsset } from "./asset";

export const styleExtensions = [".css", ".sass", ".scss", ".less"];
export const appExtensions = [".js", ".json", ".jsx", ".ts", ".tsx", ".html", ".vue"];
// prettier-ignore
export const resourceExtensions = [".png",".jpg",".jpeg",".gif",".svg",".bmp",".tiff",".tif",".woff",".woff2",".ttf",".eot",".otf",".webp",".mp3",".mp4",".wav",".mkv",".m4v",".mov",".avi",".flv",".webm",".flac",".mka",".m4a",".aac",".ogg", ".map"];
export const textExtensions = [...appExtensions, ...styleExtensions];

interface Hooks {
	done: (fn: Function) => void;
	failedResolve: (fn: Function) => void;
}

export const colors = {
	success: "#3fe63c",
	warning: "#f5b514",
	danger: "#e61c1c",
	info: "#3b97ed",
};

export function getTimeColor(time: number) {
	if (time < 5000) {
		return colors.success;
	} else if (time < 10000) {
		return colors.warning;
	} else {
		return colors.danger;
	}
}

export default class Toypack {
	public assets: Map<string, AssetInterface> = new Map();
	public options: ToypackOptions = cloneDeep(defaultOptions);
	public loaders: ToypackLoader[] = [];
	public plugins: ToypackPlugin[] = [];
	public outputSource: string = "";
	public dependencies = {};
	public packageManager;
	public _sourceMapConfig;
	public _lastId: number = 0;
	public _prevContentURL;
	public _prevContentDocURL;
	public _graphCache: Map<string, AssetInterface> = new Map();
	constructor(options?: ToypackOptions) {
		if (options) {
			this.defineOptions(options);
		}

		this._sourceMapConfig = [];
		let sourceMapConfig = this.options.bundleOptions?.output?.sourceMap;
		if (typeof sourceMapConfig == "string") {
			this._sourceMapConfig = sourceMapConfig.split("-");
		}

		this.packageManager = new PackageManager(this);

		/* Default loaders */
		this.loaders.push(new BabelLoader());
		this.loaders.push(new JSONLoader());
		this.loaders.push(new CSSLoader());
		this.loaders.push(new AssetLoader());
		this.loaders.push(new HTMLLoader());

		/* Default plugins */
		this.plugins.push(new NodePolyfillPlugin());

		// Add empty object for fallbacks with no polyfill
		this.addAsset(
			"/node_modules/toypack/empty/index.js",
			"module.exports = {};"
		);
	}

	public hooks: Hooks = {
		done: this._tapHook.bind([this, "done"]),
		failedResolve: this._tapHook.bind([this, "failedResolve"]),
	};

	public _taps: any = {};

	public _tapHook(fn: Function) {
		let compiler = this[0];
		let hookName = this[1];
		if (typeof fn == "function") {
			if (!compiler._taps[hookName]) {
				compiler._taps[hookName] = [];
			}

			compiler._taps[hookName].push(fn);
		}
	}

	public async _initHooks(hookName: string, ...args) {
		let hooks = this._taps[hookName];
		if (hooks) {
			for (let fn of hooks) {
				await fn(...args);
			}
		}
	}

	public defineOptions(options: ToypackOptions) {
		merge(this.options, options);
	}

	public async addAsset(source: string, content: string | ArrayBuffer = "") {
		return await addAsset(this, source, content);
	}

	public resolve(x: string, options?: ResolveOptions) {
		return resolve(this, x, options);
	}

	public async bundle(options?: BundleOptions) {
		return await bundle(this, options);
	}
}
