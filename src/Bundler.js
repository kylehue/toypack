import { parse as acornParse } from "acorn";
import { fullAncestor as acornWalk } from "acorn-walk";
import {
  transform as babelTransform,
  registerPlugin as babelRegisterPlugin
} from "@babel/standalone";
import HTML from "html-parse-stringify";
import * as path from "path";
import * as utils from "./utils";
import loopProtect from "@freecodecamp/loop-protect";
import { JSHINT } from "jshint";

const indexHTMLSRC = "/index.html";
const assetsMap = new Map();
let babelOptions = {
  presets: ["es2015-loose"],
  plugins: []
};

let _ID = 0;
export default class Bundler {
  constructor(options = {}) {
    this.assets = {
      entry: null,
      files: {}
    };

    this.dependencies = {
      uuid: "latest"
    };

    options = Object.assign({
      loopProtection: false,
      skipErrors: typeof options.onError == "function"
    }, options);

    this.options = options;

    if (typeof this.options.babelOptions == "object") {
      babelOptions = Object.assign(this.options.babelOptions, babelOptions);
    }

    if (this.options.loopProtection) {
      this.options.loopProtection = Object.assign({
        limit: 100,
        onLimit: null,
        maxIterations: undefined
      }, this.options.loopProtection);
      babelRegisterPlugin("loop-protect", loopProtect(this.options.loopProtection.limit, this.options.loopProtection.onLimit, this.options.loopProtection.maxIterations));
      babelOptions.plugins.push("loop-protect");
    }

		this.JSHINTOptions = {
			esversion: 6,
			undef: true,
			trailingcomma: false,
			unused: false,
			curly: false,
			asi: true,
			boss: true,
			debug: true,
			elision: true,
			eqnull: true,
			evil: true,
			expr: true,
			lastsemic: true,
			loopfunc: true,
			notypeof: true,
			noyield: true,
			plusplus: true,
			proto: true,
			scripturl: true,
			supernew: true,
			validthis: true,
			withstmt: true,
			browser: true,
			devel: true,
			module: true
		};
  }

  _createAsset(file) {
    // Avoid transforming files that didn't change
    let duplicate = assetsMap.get(file.src);
    if (duplicate && duplicate.code == file.code) {
      return duplicate;
    }

		let fileExt = path.extname(file.src);

    // Asset object
    let asset = {
      id: duplicate ? duplicate.id : _ID++,
      src: file.src,
      code: file.code,
      transpiledCode: "",
      dependencies: []
    };

		// Pass errors
		let errorFound = false;
		let hasErrorCallback = typeof this.options.onError == "function";
		let isJS = fileExt === ".js";
    if (hasErrorCallback && isJS) {
      JSHINT(file.code, this.JSHINTOptions);

      const errors = JSHINT.data().errors;
      if (errors) {
				errors.forEach(error => {
	        // Check if error is really an error and not a warning nor an info
	        if (error.code.startsWith("E") || error.code.startsWith("W")) {
	          errorFound = true;
	          this.options.onError(file, error);
	        }

					console.log("ERROR!!!!!!!");
					console.log(error);
	      });
			}
    }

		// Skip errors?
    if (this.options.skipErrors && errorFound) return asset;

    // Transform
    // Get AST
    const AST = acornParse(file.code, {
      ecmaVersion: 2020,
      sourceType: "module"
    });

    // Scan AST and get dependencies
    acornWalk(AST, node => {
      if (node.type == "ImportDeclaration") {
        asset.dependencies.push(node.source.value);
      } else if (node.type == "CallExpression" && node.callee.name == "require") {
        if (node.arguments.length) {
          asset.dependencies.push(node.arguments[0].value);
        }
      }
    });

		// onBeforeTranspile callback
    if (typeof this.options.onBeforeTranspile == "function") {
      file.code = this.options.onBeforeTranspile(file) || file.code;
    }

    // Transpile code
    asset.transpiledCode = babelTransform(file.code, babelOptions).code;

		// onTranspile callback
    if (typeof this.options.onTranspile == "function") {
      asset.transpiledCode = this.options.onTranspile(file, asset.transpiledCode) || asset.transpiledCode;
    }

    // Add asset to cache
    assetsMap.set(file.src, asset);

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
      asset.dependencies.forEach(assetRelativePath => {
        const assetAbsolutePath = path.join(dirname, assetRelativePath);

        // Check if the asset already exists
        // If it does, don't add it in dependencyGraph
        if (!graphMap.has(assetAbsolutePath)) {
          const assetDependency = this._createAsset(this.assets.files[assetAbsolutePath]);

          if (assetDependency) {
            asset.dependencyMap[assetRelativePath] = assetDependency.id;
            dependencyGraph.push(assetDependency);
            graphMap.set(assetAbsolutePath, assetDependency.id);
          } else {
            throw new Error(`Could not resolve ${assetRelativePath} in ${asset.src}`)
          }
        } else {
          asset.dependencyMap[assetRelativePath] = graphMap.get(
            assetAbsolutePath
          );
        }
      });
    }

    return dependencyGraph;
  }

  setEntry(src) {
    src = path.resolve(src);
    this.assets.entry = src;
  }

  addFile(file) {
    file.src = path.resolve(file.src);
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

  _injectHTML(bundle, htmlCode) {
    let result = bundle;

    let headTemplate = `
				<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, minimal-ui">
				<title></title>
			`;

    let htmlCacheSrc = "HTML";
    let bodyTemplate = "";
    // Inject index.html file if it exists
    if (htmlCode) {
      // Only scan AST if the code changed
      let htmlCache = assetsMap.get(htmlCacheSrc);
      let hasScanned = !!htmlCache;
      let indexHTMLChanged = htmlCache && htmlCode != htmlCache;
      if (!hasScanned || indexHTMLChanged) {
        const indexHTMLAST = HTML.parse(htmlCode);
        utils.traverseHTMLAST(indexHTMLAST, node => {
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

    result = `data:text/html;charset=utf-8,
			<!DOCTYPE html>
			<html>
				<head>
					${headTemplate}
					<script>addEventListener("DOMContentLoaded", () => {${result}})</script>
				</head>
				<body>
					${bodyTemplate}
				</body>
			</html>
			`;

    return result;
  }

  bundle(options = {}) {
    options = Object.assign({
      iframeSrc: false,
      injectHTML: false
    }, options);

    let entry = this.assets.files[this.assets.entry];
    let graph = this._createDependencyGraph(entry);
    let entryId;

    let modules = "";
    let modulesMap = new Map();
    graph.forEach(module => {
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

    let htmlCode = this.assets.files[indexHTMLSRC]?.code;
    if (options.iframeSrc || (htmlCode && options.injectHTML)) {
      result = this._injectHTML(result, htmlCode);
    }

    return utils.trim(result);
  }
}
