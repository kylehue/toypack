import { DependencyGraph } from "../graph";
import { CodeComposer, Toypack } from "../Toypack.js";
import { SourceMapGenerator } from "source-map-js";
import { requireFunction, requireCall, moduleWrap } from "./runtime.js";
import { compileScript } from "./compile-script.js";
import { mergeSourceMapToBundle } from "../utils/merge-source-map-bundle.js";
import { mergeSourceMaps } from "../utils/merge-source-maps.js";
import MapConverter from "convert-source-map";
import babelMinify from "babel-minify";
export async function bundleScript(this: Toypack, graph: DependencyGraph) {
   const config = this.getConfig();
   const bundle = new CodeComposer();
   const smg = config.bundle.sourceMap ? new SourceMapGenerator() : null;

   const finalizeBundleContent = () => {
      const bundleClone = bundle.clone();
      bundleClone.prepend(requireFunction());

      // Call if entry
      const entry = Object.values(graph).find(
         (g) => g.type == "script" && g.isEntry
      );

      if (entry && entry.type == "script") {
         bundleClone.breakLine().append(requireCall(entry.source));
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
      if (dep.type == "script") {
         const compiled = await compileScript.call(
            this,
            dep.source,
            dep.ast,
            dep.dependencyMap,
            dep.map
         );

         const wrapped = moduleWrap(source, compiled.content);
         bundle.breakLine().append(wrapped);

         if (smg && compiled.map && typeof dep.asset.content == "string") {
            let originalContent: string | undefined = undefined;
            if (
               config.bundle.sourceMap != "nosources" &&
               dep.asset.type == "text"
            ) {
               originalContent = dep.asset.content;
            }

            mergeSourceMapToBundle.call(
               this,
               smg,
               compiled.map,
               dep.source,
               compiled.content,
               finalizeBundleContent(),
               originalContent
            );
         }
      } else if (dep.type == "resource") {
         const cjsModuleContents = moduleWrap(
            dep.asset.source,
            `module.exports = "${this._getUsableResourcePath(
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

   if (config.bundle.mode == "production") {
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
