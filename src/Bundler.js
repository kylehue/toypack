import Module from "./Module";
import * as path from "path";
import HTML from "html-parse-stringify";
import * as utils from "./utils";
import CSSLoader from "./loaders/css.loader";
var previousBundleURL;
const htmlMap = new Map();
export default class Bundler {
	constructor(options = {}) {
		this.options = Object.assign(
			{
				injectHTML: true,
			},
			options
		);

		this.input = {
			entry: "",
			files: {},
			root: "fs",
			coreModulesPath: "node_modules",
		};

		this.dependencies = {};
		this.loaders = [
			{
				ext: ".css",
				use: [new CSSLoader()],
			},
		];
	}

	_loadIndex(modulePath) {
		let noext = path.join(modulePath, "index");

		return this._loadAsFile(noext);
	}

	_loadAsFile(relativePath) {
		let ext = path.extname(relativePath);
		let noext = ext
			? relativePath.substr(0, relativePath.indexOf(ext))
			: relativePath;
		let files = this.input.files;

		if (files[noext + ".js"]) {
			return noext + ".js";
		} else if (files[noext + ".json"]) {
			return noext + ".json";
		}
		
		for (let loader of this.loaders) {
			if (files[noext + loader.ext]) {
				return noext + loader.ext;
			}
		}
	}

	_loadAsDirectory(relativePath) {
		let files = this.input.files;
		let packageJSONPath = path.join(
			relativePath,
			"package.json"
		);

		let packageText = files[packageJSONPath]?.code;
		let result;
		if (packageText) {
			let packageJSON = JSON.parse(packageText);
			let mainPath = packageJSON.main;
			// If package.json's "main" is falsy, just load the index using relativePath
			if (!mainPath) {
				result = this._loadIndex(relativePath);
			} else {
				// Get absolute path
				let absolutePath = path.join(relativePath, mainPath);

				// [A] - Load the path using the absolutePath
				let asFile = this._loadAsFile(absolutePath);
				if (asFile) {
					result = asFile;
				} else {
					// [B] - If [A] didn't work, load the index's path using absolutePath
					let index = this._loadIndex(absolutePath);
					if (index) {
						result = index;
					} else {
						// [C] - If [B] didn't work, load the index's path using relativePath
						result = this._loadIndex(relativePath);
					}
				}
			}
		} else {
			result = this._loadIndex(relativePath);
		}

		return result;
	}

	resolve(root, relativePath) {
		let result = "";
		let isCoreModule = utils.isCoreModule(relativePath);
		if (isCoreModule) {
			result = this._loadAsDirectory(
				path.join(this.input.coreModulesPath, relativePath)
			);
		} else {
			let dirname = path.dirname(root);
			if (root.split(path.sep)[0] != this.input.root) {
				dirname = this.input.root;
			}
			let absolutePath = path.join(
				dirname,
				relativePath
			);

			let asFile = this._loadAsFile(absolutePath);
			if (asFile) {
				result = asFile;
			} else {
				result = this._loadAsDirectory(absolutePath);
			}
		}

		if (result) {
			return result;
		} else {
			console.error(`Unable to resolve ${relativePath}.`);
		}
	}

	getFile(src, options) {
		options = Object.assign(
			{
				isCoreModule: false,
			},
			options
		);

		let cmRoot = options.isCoreModule ? this.input.coreModulesPath : "";

		src = path.join(this.input.root, cmRoot, src);

		return this.input.files[src];
	}

	addFile(src, code, options) {
		options = Object.assign(
			{
				isCoreModule: false,
			},
			options
		);

		let cmRoot = options.isCoreModule ? this.input.coreModulesPath : "";

		src = path.join(this.input.root, cmRoot, src);
		let ext = path.extname(src);

		if (ext == ".js") {
			this.input.files[src] = new Module(src, code);
		} else {
			this.input.files[src] = {
				src,
				code,
				ext,
				updateCode(code) {
					this.code = code;
				},
			};
		}
	}

	setEntry(src) {
		this.input.entry = path.join(this.input.root, src);
	}

	_injectHTML(bundle) {
		let mainHTML = this.getFile("index.html");
		if (mainHTML) {
			let headTemplate = "";
			let bodyTemplate = "";
			let htmlCacheSrc = "HTML";

			let htmlCode = mainHTML.code;
			let htmlCache = htmlMap.get(htmlCacheSrc);

			let hasScanned = !!htmlCache;
			let mainHTMLChanged = htmlCache && htmlCode != htmlCache;

			// Only scan AST if the code changed
			if (!hasScanned || mainHTMLChanged) {
				const mainHTMLAST = HTML.parse(htmlCode);
				// Get head and body codes
				utils.traverseHTMLAST(mainHTMLAST, (node) => {
					if (node.type == "tag") {
						if (node.name == "head") {
							headTemplate = HTML.stringify(node.children);
							htmlMap.set(htmlCacheSrc + ":head", headTemplate);
						} else if (node.name == "body") {
							bodyTemplate = HTML.stringify(node.children);
							htmlMap.set(htmlCacheSrc + ":body", bodyTemplate);
						}
					}
				});

				// Update html cache
				htmlMap.set(htmlCacheSrc, htmlCode);
			}

			headTemplate = htmlMap.get(htmlCacheSrc + ":head") || headTemplate;
			bodyTemplate = htmlMap.get(htmlCacheSrc + ":body") || bodyTemplate;

			let bundleURL = URL.createObjectURL(new Blob([bundle]));
			if (previousBundleURL) {
				URL.revokeObjectURL(previousBundleURL);
			}

			previousBundleURL = bundleURL;

			return `<!DOCTYPE html>
<html>
	<head>
		<script defer src="${bundleURL}"></script>
		${headTemplate}
	</head>
	<body>
		${bodyTemplate}
	</body>
</html>
`;
		} else {
			return bundle;
		}
	}

	async _getGraph(entryModule) {
		// Load entry's dependencies
		await entryModule.loadDependencies();

		// Instantiate graph and add the entry in it
		const graph = [entryModule];

		for (let mod of graph) {
			// Scan dependency's dependencies
			for (let dependencyPath of mod.dependencies) {
				// Get resolved path
				let resolvedDependencyPath = this.resolve(mod.src, dependencyPath);

				// Get module
				let dependencyModule = this.input.files[resolvedDependencyPath];

				// Load dependency's dependencies
				await dependencyModule.loadDependencies();

				// Avoid duplicates
				if (!graph.includes(dependencyModule)) {
					// Add to graph
					graph.push(dependencyModule);
				}
			}
		}

		return graph;
	}

	async bundle() {
		console.time("Bundle time");
		// Get dependency graph
		const entryModule = this.input.files[this.input.entry];
		let graph = await this._getGraph(entryModule);

		let modules = "";

		// Scan graph
		for (let mod of graph) {
			// Make sure the current module is a javascipt file
			if (mod.ext == ".js") {
				// Transpile
				await mod.loadTranspiledCode();

				// Instantiate and get dependency map
				// This will be useful for requiring modules
				let dependencyMap = {};
				mod.dependencies.forEach((dep) => {
					dependencyMap[dep] = this.resolve(mod.src, dep);
				});

				// Concatinate each module into the stringified collection of modules
				modules += `
	"${mod.src}": {
		init: function(module, exports, require) {
			${mod.transpiledCode.split("\n").join("\n\t\t\t")}
		},
		map: ${JSON.stringify(dependencyMap)}
	},
`;
			}
		}

		// Fix format
		modules = `{${modules}}`.trim();

		let bundle = await this._addRuntime(modules, this.input.entry);
		//console.log(bundle);
		console.timeEnd("Bundle time");

		if (this.options.injectHTML) {
			bundle = this._injectHTML(bundle);
		}

		//console.log(bundle);
		return bundle;
	}

	_addRuntime(modules, entry) {
		let runtime = `	const moduleCache = {};

	function require(modulePath) {
		const { init, map } = modules[modulePath];
		const module = { exports: {} };

		moduleCache[modulePath] = module.exports;

		function localRequire(assetRelativePath) {
			if (!moduleCache[map[assetRelativePath]]) {
				moduleCache[map[assetRelativePath]] = module.exports;

				var mod = require(map[assetRelativePath]);
				moduleCache[map[assetRelativePath]] = mod;
				return mod;
			}

			return moduleCache[map[assetRelativePath]];
		}

		init(module, module.exports, localRequire);
		return module.exports;
	}

	require(entry);`;

		let result = [
			`(function(modules, entry) {`,
			runtime,
			`})(${modules}, "${entry}");`,
		].join("\n");

		return result;
	}

	addDependency() {}
}
