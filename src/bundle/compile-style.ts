import MapConverter from "convert-source-map";
import * as CSSTree from "css-tree";
import { SourceMapGenerator, RawSourceMap } from "source-map-js";
import { Toypack } from "../Toypack.js";
import { mergeSourceMaps } from "../utils";
import { DependencyGraph, StyleDependency } from "../types";

export function compileStyle(
   this: Toypack,
   chunk: StyleDependency,
   graph: DependencyGraph
) {
   const config = this.getConfig();

   // Check cache
   const bundleMode = config.bundle.mode;
   const cached = this._cachedDeps.compiled.get(
      chunk.source + "." + bundleMode
   );

   if (cached && !chunk.asset.modified) {
      return {
         source: chunk.source,
         content: cached.content,
         map: cached.map,
      };
   }

   this._pluginManager.triggerHook({
      name: "transform",
      args: [
         {
            chunk,
            type: "style",
            traverse: (opts) => {
               CSSTree.walk(chunk.ast, opts);
            },
         },
      ],
      context: {
         bundler: this,
         graph: graph,
         importer: chunk.importers[0],
      },
   });

   const compiled = CSSTree.generate(chunk.ast, {
      sourceMap: !!config.bundle.sourceMap,
   }) as any as CSSTreeGeneratedResult;

   const result = {
      source: chunk.source,
      content: "",
      map: null as RawSourceMap | null,
   };

   if (typeof compiled == "string") {
      result.content = compiled;
   } else {
      result.content = compiled.css;
      result.map = !!config.bundle.sourceMap
         ? MapConverter.fromJSON(compiled.map.toString()).toObject()
         : null;
   }

   if (result.map && chunk.map) {
      result.map = mergeSourceMaps(chunk.map, result.map);
   }

   // Cache
   if (!cached || chunk.asset.modified) {
      this._cachedDeps.compiled.set(chunk.source + "." + bundleMode, {
         content: result.content,
         map: result.map,
         asset: chunk.asset,
      });
   }

   return result;
}

export type CSSTreeGeneratedResult =
   | {
        css: string;
        map: SourceMapGenerator;
     }
   | string;
