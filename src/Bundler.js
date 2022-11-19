import Module from "./Module";
import * as path from "path";
import * as utils from "./utils";

export default class Bundler {
	constructor() {
		this.input = {
			entry: "",
			files: {},
		};

		this.dependencies = {};
	}

	addFile(src, code) {
		src = path.resolve(src);
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
		this.input.entry = src;
	}

	async _getGraph(entryModule) {
		// Load entry's dependencies
		await entryModule.loadDependencies();

		// Instantiate graph and add the entry in it
		const graph = [entryModule];

		for (let mod of graph) {
			// Avoid duplicates
			if (graph.includes(mod) && mod != entryModule) {
				continue;
			}

			// Scan dependency's dependencies
			for (let dependencyPath of mod.dependencies) {
				// Get resolved path
				let resolvedDependencyPath = utils.resolveRequest(
					mod.src,
					dependencyPath
				);

				// Get module
				let dependencyModule = this.input.files[resolvedDependencyPath];

				// Load dependency's dependencies
				await dependencyModule.loadDependencies();

				// Add to graph
				graph.push(dependencyModule);
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
		// Get dependency graph
		let graph = await this._getGraph(this.input.files[this.input.entry]);

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
					dependencyMap[dep] = utils.resolveRequest(mod.src, dep);
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

		console.log(bundle);
		return bundle;
	}

	addDependency() {}
}
