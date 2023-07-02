import MapConverter from "convert-source-map";
import { SourceMapGenerator } from "source-map-js";
import { Toypack } from "../Toypack.js";
import { compileStyle } from "./compile-style.js";
import { mergeSourceMapToBundle } from "../utils";
import { DependencyGraph } from "../types";

export async function bundleStyle(this: Toypack, graph: DependencyGraph) {
   const config = this.getConfig();
   const sourceMapConfig = config.bundle.sourceMap;
   let bundle = "";
   const smg = !!sourceMapConfig ? new SourceMapGenerator() : null;

   for (const source in graph) {
      const chunk = graph[source];
      if (chunk.type != "style") continue;

      const compiled = compileStyle.call(this, chunk, graph);
      if (!compiled.content) continue;

      bundle += compiled.content + "\n";

      if (smg && compiled.map && typeof chunk.asset.content == "string") {
         let originalContent: string | undefined = undefined;
         if (chunk.asset.type == "text") {
            originalContent = chunk.asset.content;
         }

         /**
          * Chunks that didn't emit source maps won't have its original code.
          * To solve this, we can manually put the loaded content in the
          * compiled map.
          */
         if (!chunk.map && compiled.map) {
            compiled.map.sourcesContent = [chunk.content];
            originalContent = undefined;
         }

         mergeSourceMapToBundle(
            smg,
            compiled.map,
            chunk.asset.source,
            compiled.content,
            bundle,
            originalContent
         );
      }
   }

   return {
      content: bundle,
      map: smg ? MapConverter.fromJSON(smg.toString()) : null,
   };
}
