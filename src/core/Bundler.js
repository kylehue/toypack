import * as path from "path";
import validateLoad from "./utils/validateLoad";
import assets from "./AssetManager";
import { parser as parseHTML } from "posthtml-parser";
import traverseHTMLAST from "./utils/traverseHTMLAST";
export default class Bundler {
	constructor(options) {
		this.options = Object.assign(
			{
				async: true,
			},
			options
		);

		this.entry = "";

		/* assets.add("hello/index.js", "", true);
		assets.add("hello/bro/cool", "", true);
		assets.add("hello/package.json", JSON.stringify({
			main: "bro/cool.js"
		}), true);
		console.log(assets.resolve("", "hello")); */

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
						htmlDependencies.push(node.attrs.src);
					}

					// [3.2] - Search for link tags that has "href" attribute
					if (node.tag == "link" && node.attrs?.href) {
						htmlDependencies.push(node.attrs.href);
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

	_getDependencyGraph(entry) {
		//console.log(entry);

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

		let bundles = [];

		// Scan assets
		// for (let asset of dependencyGraph) {
		// 	let ext = path.extname(asset.src);

		// 	// Get asset's transformer
		// 	let transformer = this._getTransformer(ext);
		// 	let loader = this._getLoader(ext);

		// 	if (transformer && loader) {
		// 		// Apply transformer to asset's code
		// 		let transform = transformer.apply(asset.code);

		// 		// Apply plugins
		// 		let plugins = this._getPlugins(ext);
		// 		for (let plugin of plugins) {
		// 			transform = plugin.apply(transform) || transform;
		// 		}

		// 		// Apply loader
		// 		let load = loader.apply(transform);
		// 		/* let isProperLoad = validateLoad(load);
		// 		if (isProperLoad) {
		// 			let bundle = this._createBundle();
		// 			bundles.push(bundle);
		// 			bundle.head.push(load[0]);
		// 			bundle.body.push(load[1]);
		// 		} */
		// 	} else {
		// 		// If transformer doesn't exist, throw an error
		// 		console.error(`${ext} files are not supported.`);
		// 	}
		// }
	}
}
