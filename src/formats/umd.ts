import Toypack from "@toypack/core/Toypack";
import { AssetInterface, CompiledAsset } from "@toypack/core/types";
import MagicString from "magic-string";

export default function format(
	chunk: MagicString,
	asset: AssetInterface,
	bundler: Toypack,
	{ entryId, isFirst, isLast }
) {
	let name = bundler.options.bundleOptions.output.name || "__toypack_library__";

	let result: CompiledAsset = {
		content: {} as MagicString,
	};

	chunk.indent();
	chunk.prepend(`init: function(module, exports, require) {\n`);
	chunk.prepend(`${asset.id}: {\n`);
	chunk.append(`\n},`);
	chunk.append(`\nmap: ${JSON.stringify(asset.dependencyMap) || "{}"}`);
	chunk.append(`\n},`);

	if (isFirst) {
		chunk.prepend(`
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
   var __modules__ = {`);
	} else if (isLast) {
		chunk.append(`};
   /* Require function */
   var __moduleCache__ = {};
   function __require__(assetId) {
      var __asset__ = __modules__[assetId];
      var { init, map } = __asset__;
      var __module__ = { exports: {} };
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
   return __require__(${entryId});
});
`);
	}

	result.content = chunk;
	return result;
}
