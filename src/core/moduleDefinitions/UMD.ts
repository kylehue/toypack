import { Asset } from "@toypack/loaders/types";
import MagicString from "magic-string";

export function transformChunk(content: string, asset: Asset) {
	let chunk = new MagicString(content);
	chunk.indent();
	chunk.prepend(`init: function(module, exports, require) {\n`);
	chunk.prepend(`"${asset.id}": {\n`);
	chunk.append(`\n},`);
	chunk.append(`\nmap: ${JSON.stringify(asset.dependencyMap)}`);
	chunk.append(`\n},`);

	return {
		content: chunk.toString(),
		map: chunk.generateMap({
			file: asset.id,
			source: asset.id,
			includeContent: asset.type == "module",
			hires: asset.type == "module",
		}),
	};
}

import { parse as parsePath } from "path";
import { BUNDLE_CONFIG } from "../Toypack";

export function transformBundle(content: string, options: any) {
	let bundle = new MagicString(content);
	bundle.indent().prepend("{\n").append("\n}");
	let name = options.name || parsePath(options.entry).name;
	bundle.prepend(`
(function(root, factory) {
   if (typeof exports === "object" && typeof module === "object") {
      module.exports = factory();
   } else if (typeof define === "function" && define.amd) {
      define([], factory);
   } else if (typeof exports === "object") {
      exports["${name}"] = factory();
   } else {
      root["${name}"] = factory();
   }
})(self, function() {
   var __modules__ = `).append(`;
   /* Require function */
   const __moduleCache__ = {};
   function __require__(modulePath) {
      const __asset__ = __modules__[modulePath];
      if (!__asset__) throw new Error("Could not resolve " + modulePath);
      const { init, map } = __asset__;
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
   return __require__("${options.entry}");
});
`);
	return {
		content: bundle.toString(),
		map: bundle.generateMap({
			file: "bundle.js",
			source: "bundle.js",
			includeContent: true,
			hires: !BUNDLE_CONFIG.output.optimizeSourceMap,
		}),
	};
}
