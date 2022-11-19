import { parse as acornParse } from "acorn";
import { fullAncestor as acornWalk } from "acorn-walk";
import {
	transform as babelTransform,
	registerPlugin as babelRegisterPlugin,
} from "@babel/standalone";
import HTML from "html-parse-stringify";
import * as path from "path";
import * as utils from "./utils";
import loopProtect from "@freecodecamp/loop-protect";
import { JSHINT } from "jshint";
import nodePolyfills from "./node-polyfills";

const indexHTMLSRC = "/index.html";
const assetsMap = new Map();
const dependenciesCache = new Map();
let babelOptions = {
	presets: ["es2015-loose"],
	plugins: [],
	compact: false,
};

let _ID = 0;
export default class Bundler {
	constructor(options = {}) {
		this.assets = {
			entry: null,
			files: {},
		};

		this.dependencies = {
			uuid: "latest",
		};

		options = Object.assign(
			{
				loopProtection: false,
				skipErrors: typeof options.onError == "function",
				transpile: true,
			},
			options
		);

		this.options = options;

		if (typeof this.options.babelOptions == "object") {
			babelOptions = Object.assign(this.options.babelOptions, babelOptions);
		}

		if (this.options.loopProtection) {
			this.options.loopProtection = Object.assign(
				{
					limit: 100,
					onLimit: null,
					maxIterations: undefined,
				},
				this.options.loopProtection
			);
			babelRegisterPlugin(
				"loop-protect",
				loopProtect(
					this.options.loopProtection.limit,
					this.options.loopProtection.onLimit,
					this.options.loopProtection.maxIterations
				)
			);
			babelOptions.plugins.push("loop-protect");
		}

		this.resolve = {
			crypto: "crypto-browserify",
		};

		this.JSHINTOptions = {
			/* Enforcing */
			esversion: 6,
			curly: false,
			plusplus: false,
			eqeqeq: false,
			forin: false,
			freeze: false,
			futurehostile: false,
			globals: false,
			latedef: false,
			leanswitch: false,
			maxcomplexity: false,
			maxdepth: false,
			maxerr: false,
			maxparams: false,
			maxstatements: false,
			noarg: false,
			nocomma: false,
			nonbsp: false,
			nonew: false,
			noreturnawait: false,
			predef: false,
			regexpu: false,
			shadow: false,
			singleGroups: false,
			strict: false,
			trailingcomma: false,
			undef: true,
			unused: false,
			varstmt: false,
			/* Relaxing */
			asi: true,
			boss: true,
			debug: true,
			elision: true,
			eqnull: true,
			evil: true,
			expr: true,
			funcscope: true,
			iterator: true,
			lastsemic: true,
			loopfunc: true,
			notypeof: true,
			noyield: true,
			proto: true,
			scripturl: true,
			supernew: true,
			validthis: true,
			withstmt: true,
			/* Environments */
			browser: true,
			browserify: true,
			devel: true,
			module: true,
			worker: true,
		};

		for (let polyfill in nodePolyfills) {
			let dependencyName = nodePolyfills[polyfill].split("/")[0];
			//this.addDependency(dependencyName);
		}
	}

	_createAsset(file) {
		if (!file) return;
		// Avoid transforming files that didn't change
		let duplicate = assetsMap.get(file.src);
		if (duplicate && duplicate.code == file.code) {
			return duplicate;
		}

		// Asset object
		let asset = {
			id: duplicate ? duplicate.id : _ID++,
			src: file.src,
			code: file.code,
			transpiledCode: "",
			dependencies: [],
		};

		let fileExt = path.extname(file.src);
		let isJS = fileExt === ".js";
		let isModule = !utils.isLocal(file.src);

		if (isJS || 1) {
			// Check for code errors
			let errorFound = false;
			JSHINT(file.code, this.JSHINTOptions);

			const errors = JSHINT.data().errors;
			if (errors && errors.length) {
				errorFound = true;
				errors.forEach((error) => {
					if (typeof this.options.onError == "function") {
						this.options.onError(file, error);
					}
				});
			}

			// Skip errors?
			//if (this.options.skipErrors && errorFound) return asset;

			// Transform
			// Get AST
			const AST = acornParse(file.code, {
				ecmaVersion: 2020,
				sourceType: "module",
			});

			// Scan AST and get dependencies
			acornWalk(AST, (node) => {
				let dependencySrc;
				if (node.type == "ImportDeclaration") {
					dependencySrc = node.source.value;
				} else if (
					node.type == "CallExpression" &&
					node.callee.name == "require" &&
					node.arguments.length
				) {
					dependencySrc = node.arguments[0].value;
				}

				if (dependencySrc && !utils.isExternal(dependencySrc)) {
          // Change root if it's a module
					// if (typeof file.module == "object") {
					// 	dependencySrc = path.resolve(
					// 		file.module.root,
					// 		file.module.name,
          //     path.dirname(file.src),
					// 		dependencySrc
					// 	);
					// }

          for (let polyfill in nodePolyfills) {
						if (dependencySrc == polyfill) {
              dependencySrc = nodePolyfills[polyfill];
            }
					}

					asset.dependencies.push({
						src: dependencySrc,
					});
				}
			});

			if (this.options.transpile) {
				// onBeforeTranspile callback
				if (typeof this.options.onBeforeTranspile == "function") {
					file.code = this.options.onBeforeTranspile(file) || file.code;
				}

				// Transpile code
				asset.transpiledCode = babelTransform(file.code, babelOptions).code;

				// onTranspile callback
				if (typeof this.options.onTranspile == "function") {
					asset.transpiledCode =
						this.options.onTranspile(file, asset.transpiledCode) ||
						asset.transpiledCode;
				}
			} else {
				asset.transpiledCode = file.code;
			}

			// Add asset to cache
			console.log("Added to assets: " + file.src);
			assetsMap.set(file.src, asset);
		}

		return asset;
	}

	_createDependencyGraph(file) {
		const mainAsset = this._createAsset(file);

		const dependencyGraph = [mainAsset];
		const graphMap = new Map();

		for (const asset of dependencyGraph) {
			if (!asset) continue;
			const dirname = path.dirname(asset.src);

			// Create dependency map for referencing the dependencies's ids
			asset.dependencyMap = {};

			// Scan asset's dependencies
			asset.dependencies.forEach((dependency) => {
				let assetAbsolutePath;
        console.log(dependency);
				if (utils.isLocal(dependency.src)) {
					assetAbsolutePath = path.join(dirname, dependency.src);
				} else {
					let modulePath = path.resolve("node_modules", dependency.src);
          console.log(modulePath);
					let pkgPath = path.resolve(modulePath, "package.json");
          console.log(pkgPath);
					let pkg = JSON.parse(this.assets.files[pkgPath]?.code);
          console.log(pkg);
          let main = pkg.main ? pkg.main : "index.js";
					assetAbsolutePath = path.resolve(modulePath, main);
          console.log(assetAbsolutePath);
				}
        console.log(dependency, assetAbsolutePath);

				// Check if the asset already exists
				// If it does, don't add it in dependencyGraph
				if (!graphMap.has(assetAbsolutePath)) {
					const assetDependency = this._createAsset(
						this.assets.files[assetAbsolutePath]
					);
					if (assetDependency) {
						asset.dependencyMap[dependency.src] = assetDependency.id;
						dependencyGraph.push(assetDependency);
						graphMap.set(assetAbsolutePath, assetDependency.id);
					} else {
						throw new Error(
							`Could not resolve ${dependency.src} in ${asset.src}`
						);
					}
				} else {
					asset.dependencyMap[dependency.src] = graphMap.get(assetAbsolutePath);
				}
			});
		}

		console.log("Dependency Graph: ");
		console.log(dependencyGraph);

		return dependencyGraph;
	}

	setEntry(src) {
		src = path.resolve(src);
		this.assets.entry = src;
	}

	addFile(file) {
		file.src = utils.isLocal(file.src) ? path.resolve(file.src) : file.src;
		this.assets.files[file.src] = file;
	}

	updateFile(file) {
		file.src = path.resolve(file.src);
		this.assets.files[file.src].code = file.code;
	}

	removeFile(fileSrc) {
		fileSrc = path.resolve(fileSrc);
		delete this.assets.files[fileSrc];
	}

	addDependency(name, version) {
		let duplicate = assetsMap.get(name);
		let destination = path.join("node_modules", name);

		utils.getDependency(name).then((pkg) => {
			// Scan dependency's dependencies
			for (let file of pkg.files) {
				file.blob.text().then((code) => {
					this.addFile({
						src: path.resolve(destination, file.name),
						code,
						module: {
							name: name,
							root: "node_modules",
						},
					});
				});
			}

			if (typeof pkg.package.dependencies == "object") {
				for (let dependency in pkg.package.dependencies) {
					let dependencyVersion = pkg.package.dependencies[dependency];
					this.addDependency(dependency, dependencyVersion);
				}
			}
		});

		console.log(this);
	}

	_injectHTML(bundle, htmlCode) {
		let result = bundle;

		let htmlCacheSrc = "HTML";
		let headTemplate = "";
		let bodyTemplate = "";

		// Inject index.html file if it exists
		if (htmlCode) {
			// Only scan AST if the code changed
			let htmlCache = assetsMap.get(htmlCacheSrc);
			let hasScanned = !!htmlCache;
			let indexHTMLChanged = htmlCache && htmlCode != htmlCache;
			if (!hasScanned || indexHTMLChanged) {
				const indexHTMLAST = HTML.parse(htmlCode);
				utils.traverseHTMLAST(indexHTMLAST, (node) => {
					if (node.type == "tag") {
						if (node.name == "head") {
							headTemplate = HTML.stringify(node.children);
							assetsMap.set(htmlCacheSrc + ":head", headTemplate);
						} else if (node.name == "body") {
							bodyTemplate = HTML.stringify(node.children);
							assetsMap.set(htmlCacheSrc + ":body", bodyTemplate);
						}
					}
				});

				assetsMap.set(htmlCacheSrc, htmlCode);
			}
		}

		headTemplate = assetsMap.get(htmlCacheSrc + ":head") || headTemplate;
		bodyTemplate = assetsMap.get(htmlCacheSrc + ":body") || bodyTemplate;

		result = `<!DOCTYPE html>
			<html>
				<head>
					<script>addEventListener("DOMContentLoaded", () => {${result}})</script>
					${headTemplate}
				</head>
				<body>
					${bodyTemplate}
				</body>
			</html>
			`;

		return result;
	}

	bundle(options = {}) {
		options = Object.assign(
			{
				injectHTML: true,
			},
			options
		);

		let entry = this.assets.files[this.assets.entry];
		let graph = this._createDependencyGraph(entry);
		let entryId;

		let modules = "";
		let modulesMap = new Map();
		graph.forEach((module) => {
			if (module && !modulesMap.get(module.src)) {
				modules += `${module.id}: [
				function(require, module, exports) {
					${module.transpiledCode}
				},${JSON.stringify(module.dependencyMap)}],`;

				modulesMap.set(module.src, module);

				if (module.src == this.assets.entry) {
					entryId = module.id;
				}
			}
		});

		let result = `
			(function(modules) {
				const moduleCache = {};

				function require(id) {
					if (!modules[id]) return;
					const [initModule, dependencyMap] = modules[id];
					const module = { exports: {} };
					function localRequire(assetRelativePath) {
						if (!moduleCache[assetRelativePath]) {
							moduleCache[assetRelativePath] = {};

							var moduleImport = require(dependencyMap[assetRelativePath]);
							moduleCache[assetRelativePath] = moduleImport;
							return moduleImport;
						}

						return moduleCache[assetRelativePath];
					}

					initModule(localRequire, module, module.exports);
					return module.exports;
				}

				require(${entryId});
			})({${modules}});
		`;

		result = this.test ? "module.exports = " + result : result;

		let htmlCode = this.assets.files[indexHTMLSRC]?.code;
		if (htmlCode && options.injectHTML) {
			result = this._injectHTML(result, htmlCode);
		}

		return utils.trim(result);
	}
}
