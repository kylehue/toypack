import babelMinify from "babel-minify";
import MapConverter from "convert-source-map";
import { SourceMapGenerator } from "source-map-js";
import { DependencyGraph } from "../graph";
import { CodeComposer, Toypack } from "../Toypack.js";
import { mergeSourceMapToBundle, getUsableResourcePath } from "../utils";
import { mergeSourceMaps } from "../utils/merge-source-maps.js";
import { compileScript } from "./compile-script.js";
import { requireFunction, requireCall, moduleWrap } from "./runtime.js";
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
      const chunk = graph[source];
      if (chunk.type == "script") {
         const compiled = await compileScript.call(
            this,
            chunk,
            graph
         );

         const wrapped = moduleWrap(source, compiled.content);
         bundle.breakLine().append(wrapped);

         if (smg && compiled.map && typeof chunk.asset.content == "string") {
            let originalContent: string | undefined = undefined;
            if (
               config.bundle.sourceMap != "nosources" &&
               chunk.asset.type == "text"
            ) {
               originalContent = chunk.asset.content;
            }

            mergeSourceMapToBundle(
               smg,
               compiled.map,
               chunk.asset.source,
               compiled.content,
               finalizeBundleContent(),
               originalContent
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
