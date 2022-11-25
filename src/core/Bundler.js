import * as path from "path";
import validateLoad from "./utils/validateLoad";
import assets from "./AssetManager";
import { parser as parseHTML } from "posthtml-parser";
import traverseHTMLAST from "./utils/traverseHTMLAST";
import getModuleType from "./utils/getModuleType";
export default class Bundler {
	constructor(options) {
		this.options = Object.assign(
			{
				async: true,
			},
			options
		);

		this.entry = "";
		assets.vol = {};
		/* assets.add("hello/index.js", "", true);
		assets.add("hello/bro/index.js", "", true);
		assets.add("hello/package.json", JSON.stringify({
			main: "index.js"
		}), true);
		console.log(assets.resolve("", "hello/bro")); */

		/* assets.add(
			"https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/js/bootstrap.bundle.min.js"
		);

		console.log(assets); */
	}

	addAsset(src, content) {
		assets.add(src, content);
	}

	setEntry(src) {
		this.entry = src;
	}

	_getHTMLGraph() {
		const graph = [];
		// [1] - Get .html files
		let htmlFiles = assets.vol.html;

		if (htmlFiles) {
			for (let html of assets.vol.html) {
				let htmlDependencies = [];
				// [2] - Get AST
				let AST = parseHTML(html.content);

				traverseHTMLAST(AST, (node) => {
					// [3.1] - Search for script tags that has "src" attribute
					if (node.tag == "script" && node.attrs?.src) {
						let dep = node.attrs.src;
						if (getModuleType(dep) != "external") {
							dep = path.join("/", dep);
						}
						htmlDependencies.push(dep);
					}

					// [3.2] - Search for link tags that has "href" attribute
					if (node.tag == "link" && node.attrs?.href) {
						let dep = node.attrs.href;
						if (getModuleType(dep) != "external") {
							dep = path.join("/", dep);
						}
						htmlDependencies.push(dep);
					}
				});

				graph.push({
					src: html.src,
					content: html.content,
					dependencies: htmlDependencies,
					AST
				});
			}
		}

		return graph;
	}

	async _getDependencyGraph(entry) {
		let entryAsset = assets.get(entry);
	
		console.log(await entryAsset.getDependencyGraph());
		return [];
	}

	_getTransformer(ext) {
		return {
			apply() {},
		};
	}

	_getLoader(ext) {
		return {
			apply() {},
		};
	}

	_getPlugins(ext) {
		return [];
	}

	_createBundle(code) {
		return {
			url: "",
			code: code,
			chunks: [],
		};
	}

	async bundle() {
		let htmlGraph = this._getHTMLGraph();

		for (let htmlAsset of htmlGraph) {
			for (let dependency of htmlAsset.dependencies) {
				let ext = path.extname(dependency);
				if (ext == ".js") {
					this._getDependencyGraph(dependency);
				}
			}
		}

		/* let bundles = [];

		// Scan assets
		for (let asset of dependencyGraph) {
			let ext = path.extname(asset.src);

			// Get asset's transformer
			let transformer = this._getTransformer(ext);

			if (transformer) {
				// Apply transformer to asset's code
				let {js, css} = transformer.apply(asset.code);

				
			} else {
				// If transformer doesn't exist, throw an error
				console.error(`${ext} files are not supported.`);
			}
		} */
	}
}
