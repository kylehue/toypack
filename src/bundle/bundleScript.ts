import { SourceMapGenerator } from "source-map-js";
import { CodeComposer, Toypack } from "../Toypack.js";
import { IDependencyGraph } from "../graph/index.js";
import { compileScript } from "./compileScript.js";
import { mergeMapToBundle } from "./mergeMapToBundle.js";
import * as rt from "./runtime.js";
import MapConverter from "convert-source-map";
import babelMinify from "babel-minify";
import { mergeSourceMaps } from "../utils.js";

export async function bundleScript(this: Toypack, graph: IDependencyGraph) {
   const bundle = new CodeComposer();
   const smg = this.config.bundle.sourceMap
      ? new SourceMapGenerator()
      : null;

   const finalizeBundleContent = () => {
      const bundleClone = bundle.clone();
      bundleClone.prepend(rt.requireFunction());

      const entry = Object.values(graph).find(
         (g) => g.type == "script" && g.isEntry
      );
      if (entry && entry.type == "script") {
         bundleClone.breakLine().append(rt.requireCall(entry.chunkSource));
      }

      bundleClone.wrap(`
      (function () {
         <CODE_BODY>
      })();
      `);

      return bundleClone.toString();
   };

   for (const source in graph) {
      const dep = graph[source];
      if (dep.chunkSource != source) continue;

      if (dep.type == "script") {
         const compiled = await compileScript.call(this, source, graph);
         if (!compiled.content) continue;

         const wrapped = rt.moduleWrap(source, compiled.content);
         bundle.breakLine().append(wrapped);

         if (smg && compiled.map) {
            mergeMapToBundle.call(
               this,
               smg,
               compiled.map,
               dep.asset.source,
               dep.asset.content,
               compiled.content,
               finalizeBundleContent()
            );
         }
      } else if (dep.type == "resource") {
         const cjsModuleContents = rt.moduleWrap(
            dep.asset.source,
            `module.exports = "${this.resourceSourceToUseableSource(
               dep.asset.source
            )}";`
         );

         bundle.breakLine().append(cjsModuleContents);
      }
   }

   const result = {
      content: finalizeBundleContent(),
      map: smg ? MapConverter.fromJSON(smg.toString()) : null,
   };

   const shouldMinify = this.config.bundle.mode == "production";
   if (shouldMinify) {
      let { code, map } = babelMinify(
         result.content,
         {},
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
