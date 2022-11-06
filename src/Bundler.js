import { parse as acornParse } from "acorn";
import { fullAncestor as acornWalk } from "acorn-walk";
import { transform as babelTransform } from "@babel/standalone";
import HTML from "html-parse-stringify";
import * as path from "path";
import * as utils from "./utils";

let _ID = 0;
const assetsMap = new Map();
export default class Bundler {
  constructor() {
    this.assets = {
      entry: null,
      files: {}
    };

    this.dependencies = {
      uuid: "latest"
    };
  }

  _createAsset(file) {
    // Avoid transforming files that didn't change
    let duplicate = assetsMap.get(file.src);
    if (duplicate && duplicate.code == file.code) {
      return duplicate;
    }

    // Transform
    // Get AST
    const AST = acornParse(file.code, {
      ecmaVersion: 2020,
      sourceType: "module"
    });

    // Scan AST and get dependencies
    const dependencies = [];
    acornWalk(AST, node => {
      if (node.type == "ImportDeclaration") {
        dependencies.push(node.source.value);
      } else if (node.type == "CallExpression" && node.callee.name == "require") {
        if (node.arguments.length) {
          dependencies.push(node.arguments[0].value);
        }
      }
    });

    const id = duplicate ? duplicate.id : _ID++;

    // Transpile code
    const transpiledCode = babelTransform(file.code, {
      presets: ["es2015-loose"]
    }).code;

    // Asset object
    let asset = {
      id,
      src: file.src,
      code: file.code,
      transpiledCode,
      dependencies
    };

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

      // Create dependency map for referencing the dependency's ids
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

    let indexHTML = this.assets.files["/index.html"];

    if (options.iframeSrc || (indexHTML && options.injectHTML)) {
      let headTemplate = `
				<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, minimal-ui">
				<title></title>
			`

      let bodyTemplate = "";

      // Inject index.html file if it exists
      if (indexHTML) {
        const indexHTMLAST = HTML.parse(indexHTML.code);

        utils.traverseHTMLAST(indexHTMLAST, node => {
          if (node.type == "tag") {
            if (node.name == "head") {
              headTemplate = HTML.stringify(node.children);
            } else if (node.name == "body") {
              bodyTemplate = HTML.stringify(node.children);
            }
          }
        });
      }

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
			`
    }

    return utils.trim(result);
  }
}
