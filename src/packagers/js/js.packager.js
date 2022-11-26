import * as path from "path";
import MagicString from "magic-string";
import assets from "../../core/AssetManager";

const srcMarker = "/* ASSET_SRC */";
const codeMarker = "/* ASSET_CODE */";
const mapMarker = "/* ASSET_MAP */";
const assetTemplate = new MagicString(`
"${srcMarker}": {
   init: function(module, exports, require) {
      ${codeMarker}
   },
   map: ${mapMarker}
},
`);
const modulesMarker = "/* ASSET_MODULES */";
const nameMarker = "/* ASSET_NAME */";
const runtimeTemplate = new MagicString(`
(function(root, factory) {
   if (typeof exports === "object" && typeof module === "object") {
      module.exports = factory();
   } else if (typeof define === "function" && define.amd) {
      define([], factory);
   } else if (typeof exports === "object") {
      exports["${nameMarker}"] = factory();
   } else {
      root["${nameMarker}"] = factory();
   }
})(self, function() {
   var __modules__ = ${modulesMarker};

   /* Require function */
   const __moduleCache__ = {};
   function __require__(modulePath) {
      const { init, map } = __modules__[modulePath];
      const __module__ = { exports: {} };
      __moduleCache__[modulePath] = __module__.exports;
      function localRequire(assetRelativePath) {
         if (!__moduleCache__[map[assetRelativePath]]) {
            __moduleCache__[map[assetRelativePath]] = __module__.exports;
            var __exports__ = __require__(map[assetRelativePath]);
            __moduleCache__[map[assetRelativePath]] = __exports__;
            return __exports__;
         }
         return __moduleCache__[map[assetRelativePath]];
      }
      init(__module__, __module__.exports, localRequire);
      return __module__.exports;
   }

   /* Start */
   return __require__("${srcMarker}");
});
`);

export default class JSPackager {
	constructor() {
		this.js = {};
	}

	_addRuntime(modules, entry) {
		let name = entry.name;
		if (!name) {
			let basename = path.basename(entry.src);
			name = basename.substr(0, basename.lastIndexOf(entry.ext));
		}

		let runtime = runtimeTemplate.clone();
		runtime.replaceAll(modulesMarker, modules);
		runtime.replaceAll(srcMarker, entry.src);
		runtime.replaceAll(nameMarker, name);

		return runtime.trim().toString();
	}

	_packModules(graph) {
		let modules = new MagicString("");

		// Scan graph
		for (let asset of graph) {
			// Make sure the current module is a javascipt file
			if (asset.ext == ".js") {
				// Instantiate and get dependency map
				// This will be useful for requiring modules
				let dependencyMap = {};
				asset.transformer.js.dependencies.forEach((dependencyPath) => {
					dependencyMap[dependencyPath] = assets.resolve(
						asset.src,
						dependencyPath
					);
				});

				// Concatinate each module into the stringified collection of modules
				let assetStr = assetTemplate.clone();
				assetStr.replaceAll(srcMarker, asset.src);
				assetStr.replaceAll(
					codeMarker,
					asset.transformer.js.content.split("\n").join("\n\t\t")
				);
				assetStr.replaceAll(mapMarker, JSON.stringify(dependencyMap));
				modules.append(assetStr.toString());
			}
		}

		return modules.indent().prepend("{").append("}").toString();
	}

	async _all(graph) {
		for (let asset of graph) {
			// Make sure the current module is a javascipt file
			if (asset.ext != ".js") {
				//await asset.transform();
				await asset.pack();
			}
		}
	}

	async apply(graph, entry) {
		let modules = this._packModules(graph);
		this.js = {
			content: this._addRuntime(modules, entry),
		};

		this.css = {
			content: graph
				.filter((asset) => path.extname(asset.src) == ".css")
				.map((asset) => (asset = asset.transformer.css.content)),
		};
	}
}
