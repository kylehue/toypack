import Module from "./Module";
import * as path from "path";
import * as utils from "./utils";

const graphCache = {};
export default class Bundler {
	constructor() {
		this.input = {
			entry: "",
			files: {},
			root: "fs",
			coreModulesPath: "node_modules",
		};

		this.dependencies = {};
	}

	_loadIndex(modulePath) {
		let noext = path.join(this.input.root, modulePath, "index");
		let files = this.input.files;

		if (files[noext + ".js"]) {
			return noext + ".js";
		} else if (files[noext + ".json"]) {
			return noext + ".json";
		}
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
	}

	_loadAsDirectory(relativePath) {
		let files = this.input.files;
		let packageJSONPath = path.join(
			this.input.root,
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
				let absolutePath = path.join(this.input.root, relativePath, mainPath);
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
			let absolutePath = path.join(path.dirname(root), relativePath);
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
			throw new Error(`Unable to resolve ${relativePath}.`);
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
			};
		}
	}

	setEntry(src) {
		this.input.entry = path.join(this.input.root, src);
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
		console.timeEnd("Bundle time");

		//console.log(bundle);
		return bundle;
	}

	addDependency() {}
}
