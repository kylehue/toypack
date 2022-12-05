import {
	transform as babelTransform,
	availablePlugins,
} from "@babel/standalone";

const SOURCE_MAP_RE = new RegExp("//[#@] (source(?:Mapping)?URL)=(.*)");
export function formatAsset(chunk: any, asset: any) {
	let transpilation = babelTransform(chunk.toString(), {
		presets: ["es2015-loose"],
		compact: true,
		sourceMaps: true,
		sourceFileName: asset.id,
		sourceType: "module",
	});

	console.log(transpilation);

	//chunk.prepend("/*\n").append("*/\n");
	//chunk.append("eval(`");
	//chunk.append(transpilation.code);
	//chunk.append("`)");
	chunk.indent();
	chunk.prepend(`init: function(module, exports, require) {\n`);
	chunk.prepend(`"${asset.id}": {\n`);
	chunk.append(`\n},`);
	chunk.append(`\nmap: ${JSON.stringify(asset.dependencyMap)}`);
	chunk.append(`\n},`);

	return {
      content: chunk,
      map: transpilation.map
	};
}

export function formatBundle(bundle: any, entryId: any) {
	bundle.indent().prepend("{\n").append("\n}");
	let name = "Sample";
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
   return __require__("${entryId}");
});
`);
	return bundle;
}
