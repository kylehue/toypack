import Toypack from "./Toypack";
import path from "path-browserify";
import MagicString from "magic-string";
import { parse as parsePackageName } from "parse-package-name";
import { parse as getAST, ParseResult } from "@babel/parser";
import traverseAST from "@babel/traverse";

const versionRegexString = "@v?[0-9]+\\.[0-9]+\\.[0-9]+";

const packageProviders = {
	"esm.sh": "https://esm.sh/",
	skypack: "https://cdn.skypack.dev/",
};
export type PackageProvider = keyof typeof packageProviders;

interface Dependency {
	content: string;
	source: string;
}

interface ImportedInfo {
	id: string;
	start: number;
	end: number;
}

export default class PackageManager {
	public provider: string;
	public providerRegex: RegExp;
	constructor(public bundler: Toypack) {
		this.provider = packageProviders[bundler.options.packageProvider as string];

		this.providerRegex = new RegExp(this.provider.replace(/\./g, "\\."));
	}

	private async _createGraph(source: string, graph: Dependency[] = []) {
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

			let imports: ImportedInfo[] = [];

			function addImported(id: string, start, end) {
				imports.push({
					id,
					start,
					end,
				} as ImportedInfo);
			}

			traverseAST(AST, {
				ImportDeclaration({ node }) {
					addImported(node.source.value, node.source.start, node.source.end);
				},
				ExportAllDeclaration({ node }) {
					addImported(node.source.value, node.source.start, node.source.end);
				},
				ExportNamedDeclaration({ node }) {
					if (node.source) {
						addImported(node.source.value, node.source.start, node.source.end);
					}
				},
			});

			for (let node of imports) {
				let id = node.id;

				let from = source.replace(this.providerRegex, "");
				let to = id.replace(this.providerRegex, "");

				let fromBaseDir = path.dirname(from);
				let relative = path.relative(fromBaseDir, to);
				let absolute = path.resolve(fromBaseDir, relative);

				// For skypack's URL format
				if (/,mode=imports/.test(source)) {
					absolute = path.resolve(fromBaseDir, id);
				}

				if (!dependencies.some((ex) => ex == absolute)) {
					dependencies.push(absolute);
				}

				chunk.update(node.start, node.end, `"./${relative}"`);
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
			if (!graph.some((v) => v.source === dependency)) {
				let url = `${this.provider}${dependency.replace(/^\//, "")}`;
				await this._createGraph(url, graph);
			}
		}

		return graph;
	}

	public async install(source: string) {
		let pkg = parsePackageName(source);
		let name = pkg.name;
		let version = pkg.version;
		let subpath = pkg.path;

		// Fetch
		let target = `${name}@${version}${subpath}`;
		let url = `${this.provider}${target}`;

		// Create graph
		let graph = await this._createGraph(url);

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

		// Add to bundler assets
		for (let asset of graph) {
			let cmSource = path.join("node_modules", name, asset.source);
			await this.bundler.addAsset(cmSource, asset.content);
		}
	}
}