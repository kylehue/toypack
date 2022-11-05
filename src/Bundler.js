import {
  parse as acornParse
} from "acorn";
import {
  fullAncestor as acornWalk
} from "acorn-walk";
import {
  transform as babelTransform
} from "@babel/standalone";
import * as path from "path";

function trim(str) {
  const lines = str.split('\n').filter(Boolean);
  const padLength = lines[0].length - lines[0].trimLeft().length;
  const regex = new RegExp(`^\\s{${padLength}}`);
  return lines.map(line => line.replace(regex, '')).join('\n');
}

let _ID = 0;
const assetsMap = new Map();
export default class Bundler {
  constructor() {
    this.assets = {
      entry: null,
      files: {}
    };

    this.dependencies = {
      "uuid": "latest"
    };

		const AST = acornParse(`const e = require("scripts/hello.js")`, {
			ecmaVersion: 2020,
			sourceType: "module"
		});

		// Scan AST and get dependencies
		acornWalk(AST, node => {
			console.log(node);
		});
  }

  _createAsset(file) {
    try {
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
        presets: ["env"]
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
    } catch (e) {
      console.warn(e);
    }
  }

  _createDependencyGraph(file) {
    const mainAsset = this._createAsset(file);

    const queue = [mainAsset];
    const graphMap = new Map();

    for (const asset of queue) {
      if (!asset) continue;
      const dirname = path.dirname(asset.src);

			// Create dependency map for referencing the dependency's ids
      asset.dependencyMap = {};

			// Scan asset's dependencies
      asset.dependencies.forEach(assetRelativePath => {
        const assetAbsolutePath = path.join(dirname, assetRelativePath);

        // Check if the asset already exists
        // If it does, don't add it in queue
        if (!graphMap.has(assetAbsolutePath)) {
          const child = this._createAsset(this.assets.files[assetAbsolutePath]);
          asset.dependencyMap[assetRelativePath] = child.id;
          queue.push(child);
          graphMap.set(assetAbsolutePath, child.id);
        } else {
          asset.dependencyMap[assetRelativePath] = graphMap.get(assetAbsolutePath);
        }
      });
    }

    return queue;
  }

  setEntry(src) {
    this.assets.entry = src;
  }

  addFile(file) {
    this.assets.files[file.src] = file;
  }

  updateFile(file) {
    this.assets.files[file.src].code = file.code;
  }

	removeFile(fileSrc) {
		delete this.assets.files[fileSrc];
	}

  bundle() {
    let graph = this._createDependencyGraph(this.assets.files[this.assets.entry]);

    let modules = "";

    let entryId;

    graph.forEach(module => {
      if (module) {
        modules += `${module.id}: [
				function(require, module, exports) {
					${module.transpiledCode}
				},
				${JSON.stringify(module.dependencyMap)}
			],
			`;

        if (module.src == this.assets.entry) {
          entryId = module.id;
        }
      }
    });

    const result = `
			(function(modules) {
				const moduleCache = {};

				function require(id) {
					if (!modules[id]) return;
					const [initModule, dependencyMap] = modules[id];
					const module = { exports: {} };

					function localRequire(assetRelativePath) {
						if (moduleCache[assetRelativePath]) {
							return moduleCache[assetRelativePath];
						}

						moduleCache[assetRelativePath] = module.exports;
						return require(dependencyMap[assetRelativePath]);
					}

					initModule(localRequire, module, module.exports);
					return module.exports;
				}

				require(${entryId});
			})({${modules}});
		`;

    return trim(result);
  }
}
