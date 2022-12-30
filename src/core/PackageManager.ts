import Toypack from "./Toypack";
import path from "path-browserify";
import MagicString from "magic-string";
import { parse as parsePackageName } from "parse-package-name";
import { parse as getAST } from "@babel/parser";
import traverseAST from "@babel/traverse";
import { AssetInterface } from "./types";
import { getModuleImports, isLocal } from "@toypack/utils";

const packageProviders = {
	"esm.sh": "https://esm.sh/",
	skypack: "https://cdn.skypack.dev/",
};

export type PackageProvider = keyof typeof packageProviders;

interface Dependency {
	content: string;
	source: string;
}

interface ParsedPackageName {
	name: string;
	version: string;
	path: string;
}

function getCoreModuleSubpath(source: string) {
	return source.split("/").splice(3).join("/");
}

export default class PackageManager {
	public provider: string;
	public providerRegex: RegExp;
	private _cache: Map<string, Dependency[]> = new Map();
	constructor(public bundler: Toypack) {
		this.provider = packageProviders[bundler.options.packageProvider as string];
		this.providerRegex = new RegExp(this.provider.replace(/\./g, "\\."));
	}

	private async _createGraph(
		source: string,
		pkg: ParsedPackageName,
		graph: Dependency[] = []
	) {
		// Fetch
		let fetchResponse = await fetch(source);
		if (!fetchResponse.ok) {
			throw new Error(`Failed to fetch ${source}.`);
		}

		let content = await fetchResponse.text();
		let dependencies: string[] = [];

		// Try parsing content
		let AST: any = null;
		try {
			if (!/\.(css|json)$/.test(source)) {
				AST = getAST(content, {
					sourceType: "module",
					sourceFilename: source,
				});
			}
		} catch (error) {
			//
		}

		// Get dependencies if there's an AST
		if (AST) {
			let chunk = new MagicString(content);
			let imports = getModuleImports(AST);

			for (let node of imports) {
				let id = node.id;

				let from = source.replace(this.providerRegex, "");
				let to = id.replace(this.providerRegex, "");

				let fromBaseDir = path.dirname(from);
				let relative = path.relative(fromBaseDir, to);
				let absolute = path.resolve(fromBaseDir, relative);

				if (isLocal(id) && !id.startsWith("/")) {
					absolute = path.resolve(fromBaseDir, id);
				}

				if (!dependencies.some((ex) => ex == absolute)) {
					dependencies.push(absolute);
				}

				chunk.update(node.start, node.end, `"${pkg.name}${absolute}"`);
			}

			content = chunk.toString();
		}

		// Add to graph
		graph.push({
			content,
			source: source.replace(this.providerRegex, ""),
		} as Dependency);

		// Scan dependency's dependencies
		for (let dependency of dependencies) {
			let dep = dependency.replace(/^\//, "");
			if (!graph.some((v) => v.source.replace(/^\//, "") === dep)) {
				let url = `${this.provider}${dep}`;
				await this._createGraph(url, pkg, graph);
			}
		}

		return graph;
	}

	/**
	 * Adds a package to the bundler.
	 * 
	 * @param {string} source The package source. Format is `<name>@<version><subpath>`
	 * @example
	 *
	 * install("bootstrap");
	 * install("bootstrap/dist/css/bootstrap.min.css");
	 * install("bootstrap@5.2/dist/css/bootstrap.min.css");
	 */
	public async install(source: string) {
		let pkg: ParsedPackageName = parsePackageName(source);
		let name = pkg.name;
		let version = pkg.version;
		let subpath = pkg.path;

		// Fetch
		let target = `${name}@${version}${subpath}`;

		// Dev mode
		if (this.provider == packageProviders["esm.sh"]) {
			if (this.bundler.options.bundleOptions?.mode === "development") {
				target += "?dev";
			} else {
				target += "?prod";
			}
		}

		let url = `${this.provider}${target}`;

		if (this.bundler.options.bundleOptions?.logs) {
			console.log(
				`%cInstalling: %c${name + subpath}`,
				"font-weight: bold; color: white;",
				"color: #cfd0d1;"
			);
		}

		// Get graph
		let graph: Dependency[] | null = null;
		let cached = this._cache.get(target);
		if (cached) {
			graph = cached;
		} else {
			graph = await this._createGraph(url, pkg, []);
		}

		// Fix entry's source
		if (subpath) {
			let extension = path.extname(subpath);
			if (extension) {
				graph[0].source = subpath;
			} else {
				graph[0].source = path.join(subpath, "index.js");
			}
		} else {
			graph[0].source = "index.js";
		}

		// Check duplicate contents
		// Duplicates will just contain exports that links to the original content
		// Solves https://github.com/facebook/react/issues/13991
		let bundlerAssets = this.bundler.assets.values();
		for (let i = 0; i < this.bundler.assets.size; i++) {
			let coreAsset: AssetInterface = bundlerAssets.next().value;
			if (!coreAsset.source.startsWith("/node_modules/")) continue;
			for (let graphAsset of graph) {
				let isSameContent = coreAsset.content === graphAsset.content;
				let isSameSource =
					getCoreModuleSubpath(coreAsset.source) ===
					getCoreModuleSubpath(graphAsset.source);
				if (isSameContent || isSameSource) {
					let target = coreAsset.source.replace("/node_modules/", "");
					graphAsset.content = `export * from "${target}";export {default} from "${target}";`;
				}
			}
		}

		// Add to bundler assets
		for (let asset of graph) {
			let cmSource = path.join("node_modules", name, asset.source);
			await this.bundler.addAsset(cmSource, asset.content);
		}

		if (this.bundler.options.bundleOptions?.logs) {
			console.log(
				`%cSuccessfully installed: %c${name + subpath} (added ${
					graph.length
				} packages)`,
				"font-weight: bold; color: white;",
				"color: #cfd0d1;"
			);
		}

		// Cache
		this._cache.set(target, graph);
	}
}