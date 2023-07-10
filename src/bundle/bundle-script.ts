import babelMinify from "babel-minify";
import MapConverter from "convert-source-map";
import { DependencyGraph } from "../graph";
import { Toypack } from "../Toypack.js";
import { mergeSourceMapToBundle, getUsableResourcePath } from "../utils";
import { mergeSourceMaps } from "../utils/merge-source-maps.js";
import { compileScript } from "./compile-script.js";
import { requireFunction, requireCall, moduleWrap } from "./runtime.js";
import { GenMapping, toEncodedMap } from "@jridgewell/gen-mapping";

export async function bundleScript(this: Toypack, graph: DependencyGraph) {
   const config = this.getConfig();
   const sourceMapConfig = config.bundle.sourceMap;
   let bundle = "";
   const smg = !!sourceMapConfig ? new GenMapping() : null;

   const finalizeBundleContent = () => {
      let bundleClone = bundle;
      bundleClone = requireFunction() + bundleClone;

      // Call if entry
      const entry = Object.values(graph).find(
         (g) => g.type == "script" && g.isEntry
      );

      if (entry && entry.type == "script") {
         bundleClone += "\n";
         bundleClone += requireCall(entry.source);
      }

      bundleClone = "(function () {\n" + bundleClone + "\n})();";

      return bundleClone;
   };

   for (const source in graph) {
      const chunk = graph[source];
      if (chunk.type == "script") {
         const compiled = await compileScript.call(this, chunk, graph);

         const wrapped = moduleWrap(source, compiled.content);
         bundle += "\n" + wrapped;

         if (smg && compiled.map && typeof chunk.asset.content == "string") {
            mergeSourceMapToBundle(
               smg,
               compiled.map,
               chunk.asset.source,
               compiled.content,
               finalizeBundleContent()
            );
         }
      } else if (chunk.type == "resource") {
         const cjsModuleContents = moduleWrap(
            chunk.asset.source,
            `module.exports = "${getUsableResourcePath(
               this,
               chunk.asset.source
            )}";`
         );

         bundle += "\n" + cjsModuleContents;
      }
   }

   const result = {
      content: finalizeBundleContent(),
      map: smg ? MapConverter.fromObject(toEncodedMap(smg)) : null,
   };

   if (config.bundle.mode == "production") {
      let { code, map } = babelMinify(
         result.content,
         {
            builtIns: false,
            ...config.babel.minify,
         },
         {
            sourceMaps: true,
            comments: false,
         }
      );

      if (result.map && map) {
         map = mergeSourceMaps(result.map.toObject(), map);
      }

      result.content = code;
      result.map = MapConverter.fromObject(map);
   }

   return result;
}
