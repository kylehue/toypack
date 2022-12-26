import Toypack from "@toypack/core/Toypack";
import { AssetInterface, CompiledAsset } from "@toypack/core/types";
import MagicString from "magic-string";
import { minimizeStr } from "@toypack/utils";

function getTopUMD(name: string) {
	return minimizeStr(
		`(function UMD(root, factory) {
   if (typeof exports === "object" && typeof module === "object") {
      module.exports = factory();
   } else if (typeof define === "function" && define.amd) {
      define([], factory);
   } else if (typeof exports === "object") {
      exports["__NAME_MARKER__"] = factory();
   } else {
      root["__NAME_MARKER__"] = factory();
   }
})(self, function() {
   var __modules__ = {`.replace(new RegExp("__NAME_MARKER__", "g"), name)
	);
}

function getBottomUMD(entryId: string) {
	return minimizeStr(`};
   /* Require function */
   var __moduleCache__ = {};
   function __require__(assetId) {
      var __asset__ = __modules__[assetId];
      var init = __asset__.init;
      var map = __asset__.map;
      var __module__ = { exports: {} };
      __moduleCache__[assetId] = __module__.exports;
      function localRequire(assetRelativePath) {
         if (!__moduleCache__[map[assetRelativePath]]) {
            __moduleCache__[map[assetRelativePath]] = __module__.exports;
            if (!map[assetRelativePath]) {
               throw new Error("Could not resolve " + assetRelativePath);
            }
            
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
   return __require__(__ENTRY_MARKER__);
});
`).replace(new RegExp("__ENTRY_MARKER__", "g"), entryId);
}

export default function format(
	chunk: MagicString,
	asset: AssetInterface,
	bundler: Toypack,
	{ entryId, isFirst, isLast }
) {
	let name = bundler.options.bundleOptions?.output?.name || "";

	let result: CompiledAsset = {
		content: {} as MagicString,
	};

	chunk.prepend(`init: function(module, exports, require) {`);
	chunk.prepend(`${asset.id}: {`);
	chunk.append(`},`);
	chunk.append(`map: ${JSON.stringify(asset.dependencyMap) || "{}"}`);
   chunk.append(`},`);

	if (isFirst) {
		chunk.prepend(getTopUMD(name));
	}

	if (isLast) {
		chunk.append(getBottomUMD(entryId));
	}

	result.content = chunk.trim();
	return result;
}
