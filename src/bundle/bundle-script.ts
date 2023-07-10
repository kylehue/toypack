import babelMinify from "babel-minify";
import MapConverter from "convert-source-map";
import { DependencyGraph } from "../graph";
import { Toypack } from "../Toypack.js";
import {
   mergeSourceMapToBundle,
   getUsableResourcePath,
   BundleGenerator,
} from "../utils";
import { mergeSourceMaps } from "../utils/merge-source-maps.js";
import { compileScript } from "./compile-script.js";
import { requireFunction, requireCall, moduleWrap } from "./runtime.js";
import { GenMapping, toEncodedMap } from "@jridgewell/gen-mapping";

let generator: BundleGenerator | null = null;
export async function bundleScript(this: Toypack, graph: DependencyGraph) {
   const config = this.getConfig();
   const sourceMapConfig = config.bundle.sourceMap;
   const bundleGenerator = generator ? generator : new BundleGenerator([
      `(function() {\n${requireFunction()}\n`,
      `\n})();`
   ]);

   for (const source in graph) {
      const chunk = graph[source];
      if (chunk.type == "script") {
         const compiled = await compileScript.call(this, chunk, graph);
         const wrapped = moduleWrap(source, compiled.content, chunk.isEntry);
         if (generator) {
            if (chunk.asset.modified) {
               generator.update({
                  source: chunk.source,
                  content: wrapped,
                  map: compiled.map,
               });
            }
         } else {
            bundleGenerator.add({
               source: chunk.source,
               content: wrapped,
               map: compiled.map,
            });
         }
      } else if (chunk.type == "resource") {
         const cjsModuleContents = moduleWrap(
            chunk.asset.source,
            `module.exports = "${getUsableResourcePath(
               this,
               chunk.asset.source
            )}";`
         );
         
         if (generator) {
            if (chunk.asset.modified) {
               generator.update({
                  source: chunk.source,
                  content: cjsModuleContents,
               });
            }
         } else {
            bundleGenerator.add({
               source: chunk.source,
               content: cjsModuleContents,
            });
         }
      }
   }

   const result = {
      content: bundleGenerator.toString(),
      map: !!sourceMapConfig
         ? MapConverter.fromObject(bundleGenerator.getMap())
         : null,
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

   generator ??= bundleGenerator;

   return result;
}
