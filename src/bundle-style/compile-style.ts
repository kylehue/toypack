import { EncodedSourceMap } from "@jridgewell/gen-mapping";
import MapConverter from "convert-source-map";
import * as CSSTree from "css-tree";
import path from "path-browserify";
import { SourceMapGenerator } from "source-map-js";
import {
   getUsableResourcePath,
   isLocal,
   isUrl,
   mergeSourceMaps,
   shouldProduceSourceMap,
} from "../utils/index.js";
import type { StyleModule, Toypack, DependencyGraph } from "src/types";

export async function compileStyle(
   this: Toypack,
   graph: DependencyGraph,
   chunk: StyleModule
) {
   const config = this.config;
   const sourceMapConfig = config.bundle.sourceMap;
   const shouldMap = shouldProduceSourceMap(
      chunk.asset.source,
      sourceMapConfig
   );

   // Check cache
   const cached = this._getCache(chunk.source);
   if (cached && !chunk.asset.modified && cached.content) {
      return {
         source: chunk.source,
         content: cached.content,
         map: cached.map,
      };
   }

   await this._pluginManager.triggerHook({
      name: "transformStyle",
      args: [chunk.source, chunk.content, chunk.ast],
      callback(opts) {
         CSSTree.walk(chunk.ast, opts);
      },
      context: {
         graph,
         importers: chunk.importers,
         source: chunk.source,
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
      map: null as EncodedSourceMap | null,
   };

   if (typeof compiled == "string") {
      result.content = compiled;
   } else {
      result.content = compiled.css;
   }

   let map: EncodedSourceMap | null = null;
   if (shouldMap && typeof compiled != "string" && compiled.map) {
      map = MapConverter.fromJSON(
         compiled.map.toString()
      ).toObject() as EncodedSourceMap;
      map.sourcesContent = [chunk.content];
      map.sources = [chunk.source];
      if (chunk.map) {
         map = mergeSourceMaps(chunk.map, map);
      }

      result.map = map;
   }

   // Cache
   this._setCache(chunk.source, {
      content: result.content,
      map: result.map,
      importers: chunk.importers,
   });

   return result;
}

export type CSSTreeGeneratedResult =
   | {
        css: string;
        map: SourceMapGenerator;
     }
   | string;
