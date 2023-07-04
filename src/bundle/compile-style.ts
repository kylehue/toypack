import MapConverter from "convert-source-map";
import * as CSSTree from "css-tree";
import { SourceMapGenerator, RawSourceMap } from "source-map-js";
import { Toypack } from "../Toypack.js";
import { getUsableResourcePath, isLocal, isUrl, mergeSourceMaps } from "../utils";
import { DependencyGraph, StyleDependency } from "../types";
import { shouldProduceSourceMap } from "../utils/should-produce-source-map.js";
import path from "path-browserify";

export function compileStyle(
   this: Toypack,
   chunk: StyleDependency,
   graph: DependencyGraph
) {
   const config = this.getConfig();
   const sourceMapConfig = config.bundle.sourceMap;
   const shouldMap = shouldProduceSourceMap(
      chunk.asset.source,
      sourceMapConfig
   );

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

   for (const node of chunk.urlNodes) {
      /**
       * We have to convert the path to relative path if
       * it doesn't begin with `./`, `../`, or `/` because
       * url() in css are always relative.
       * https://developer.mozilla.org/en-US/docs/Web/CSS/url
       */
      if (!isLocal(node.value) && !isUrl(node.value)) {
         node.value = "./" + node.value.replace(/^\//, "");
      }

      // Change to usable source
      const resourceUseableSource = getUsableResourcePath(
         this,
         node.value,
         path.dirname(chunk.source)
      );
      
      if (resourceUseableSource) {
         node.value = resourceUseableSource;
      }
   }

   const compiled = CSSTree.generate(chunk.ast, {
      sourceMap: shouldMap,
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
      result.map = shouldMap
         ? MapConverter.fromJSON(compiled.map.toString()).toObject()
         : null;
   }

   if (shouldMap && result.map && chunk.map) {
      result.map.sourcesContent = [chunk.content];
      result.map.sources = [chunk.source];
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
