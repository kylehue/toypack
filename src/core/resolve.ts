import { isLocal, isURL } from "@toypack/utils";
import path from "path-browserify";
import Toypack, { textExtensions, resourceExtensions } from "./Toypack";
import { ResolveOptions } from "./types";

export function getResolveFallbackData(bundler: Toypack, str: string) {
	let fallbacks = bundler.options.bundleOptions?.resolve?.fallback;
	if (fallbacks) {
		for (let [id, fallback] of Object.entries(fallbacks)) {
			if (str.startsWith(id)) {
				return {
					id,
					fallback,
				};
			}
		}
	}
}

export function getResolveAliasData(bundler: Toypack, str: string) {
	let aliases = bundler.options.bundleOptions?.resolve?.alias;
	if (aliases) {
		// Find strict equals first
		for (let [alias, replacement] of Object.entries(aliases)) {
			if (str === alias) {
				return {
					alias,
					replacement,
				};
			}
		}

		for (let [alias, replacement] of Object.entries(aliases)) {
			let aliasRegex = new RegExp(`^${alias}/`);
			if (aliasRegex.test(str)) {
				return {
					alias,
					replacement,
				};
			}
		}
	}
}

export default function resolve(
	bundler: Toypack,
	x: string,
	options?: ResolveOptions
) {
	if (typeof x !== "string") {
		throw new TypeError("Path must be a string.");
	}

	let result = "";
	let orig = x;

	// Resolve.extensions
	let extensions = [...textExtensions, ...resourceExtensions];
	let priorityExtensions = bundler.options.bundleOptions?.resolve?.extensions;
	if (priorityExtensions) {
		for (let priorityExtension of priorityExtensions) {
			let index = extensions.indexOf(priorityExtension);
			if (index >= 0) {
				extensions.splice(index, 1);
			}
		}

		extensions = [...priorityExtensions, ...extensions];
	}

	const opts = Object.assign(
		{
			extensions,
			baseDir: ".",
			includeCoreModules: true,
		},
		options
	);

	// Resolve.alias
	let aliasData = getResolveAliasData(bundler, x);
	if (aliasData) {
		let aliased = path.join(
			aliasData.replacement,
			x.replace(aliasData.alias, "")
		);
		let aliasIsCoreModule =
			!isLocal(aliasData.replacement) && !isURL(aliasData.replacement);

		if (!aliasIsCoreModule) {
			aliased = "./" + path.relative(opts.baseDir, aliased);
		}

		x = aliased;
	}

	const tryFileThenIndex = (x: string) => {
		let file = loadAsFile(x);

		if (file) {
			return file;
		} else {
			return loadIndex(x);
		}
	};

	const loadAsDirectory = (x: string) => {
		let pkg = bundler.assets.get(path.join(x, "package.json"));

		if (typeof pkg?.content == "string") {
			let main = JSON.parse(pkg.content).main;
			if (!main) {
				return tryFileThenIndex(x);
			} else {
				let absolutePath = path.join(x, main);
				return tryFileThenIndex(absolutePath);
			}
		} else {
			return tryFileThenIndex(x);
		}
	};

	const loadAsFile = (x: string) => {
		let parsedPath = path.parse(x);
		let noExt = path.join(parsedPath.dir, parsedPath.name);

		for (let i = 0; i < opts.extensions.length; i++) {
			let extension = opts.extensions[i];
			let asset = bundler.assets.get(noExt + extension);

			if (asset) {
				return asset.source;
			}
		}

		return "";
	};

	const loadIndex = (x: string) => {
		let resolvedIndex = path.join(x, "index");
		return loadAsFile(resolvedIndex);
	};

	const resolve = (x: string) => {
		if (opts.includeCoreModules && !isLocal(x) && !isURL(x)) {
			let resolved = path.join("/", "node_modules", x);
			return loadAsDirectory(resolved);
		} else if (isURL(x)) {
			return x;
		} else {
			let resolved = path.join("/", opts.baseDir, x);
			let file = loadAsFile(resolved);
			if (file) {
				return file;
			} else {
				return loadAsDirectory(resolved);
			}
		}
	};

	result = resolve(x);

	// Resolve.fallback
	if (!result) {
		let fallbackData = getResolveFallbackData(bundler, orig);
		if (fallbackData) {
			if (typeof fallbackData.fallback == "boolean") {
				result = "/node_modules/toypack/empty/index.js";
			} else if (typeof fallbackData.fallback == "string") {
				result = resolve(fallbackData.fallback);
			}
		}
	}

	return result;
}
