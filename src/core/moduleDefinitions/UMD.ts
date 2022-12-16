import { Asset } from "@toypack/loaders/types";
import MagicString from "magic-string";

export function transformChunk(content: string, asset: Asset, meta: any) {
	let chunk = new MagicString(content);
	chunk.indent();
	chunk.prepend(`init: function(module, exports, require) {\n`);
	chunk.prepend(`${asset.id}: {\n`);
	chunk.append(`\n},`);
	chunk.append(`\nmap: ${JSON.stringify(asset.dependencyMap) || "{}"}`);
   chunk.append(`\n},`);
   
   if (meta.isFirst) {
			chunk.prepend(`
(function(root, factory) {
   if (typeof exports === "object" && typeof module === "object") {
      module.exports = factory();
   } else if (typeof define === "function" && define.amd) {
      define([], factory);
   } else if (typeof exports === "object") {
      exports["${meta.name}"] = factory();
   } else {
      root["${meta.name}"] = factory();
   }
})(self, function() {
   var __modules__ = {`);
		}
   
   if (meta.isLast) {
			chunk.append(`};
   /* Require function */
   const __moduleCache__ = {};
   function __require__(assetId) {
      const __asset__ = __modules__[assetId];
      if (!__asset__) throw new Error("Could not resolve " + assetId);
      const { init, map } = __asset__;
      const __module__ = { exports: {} };
      __moduleCache__[assetId] = __module__.exports;
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
   return __require__(${meta.entryId});
});
`);
		}

	return {
		content: chunk.toString(),
		map: BUNDLE_CONFIG.output.sourceMap ? chunk.generateMap({
			file: asset.source,
			source: asset.source,
			includeContent: true,
			hires: true,
		}) : {},
	};
}

import { parse as parsePath } from "path";
import { BUNDLE_CONFIG } from "../Toypack";

export function transformBundle(content: string, options: any) {
	let bundle = new MagicString(content);
	bundle.indent().prepend("{\n").append("\n}");
	let name = BUNDLE_CONFIG.output.name || parsePath(options.entrySource).name;
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
   function __require__(assetId) {
      const __asset__ = __modules__[assetId];
      if (!__asset__) throw new Error("Could not resolve " + assetId);
      const { init, map } = __asset__;
      const __module__ = { exports: {} };
      __moduleCache__[assetId] = __module__.exports;
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
   return __require__(${options.entryId});
});
`);
   
	return {
		content: bundle.toString(),
		map: BUNDLE_CONFIG.output.sourceMap ? bundle.generateMap({
			file: "bundle.js",
			source: "bundle.js",
			includeContent: true,
			hires: true,
		}) : {},
	};
}
