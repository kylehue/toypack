import MapConverter from "convert-source-map";
import { SourceMapGenerator } from "source-map-js";
import { CodeComposer, Toypack } from "../Toypack.js";
import { compileStyle } from "./compile-style.js";
import { mergeSourceMapToBundle } from "../utils";
import { DependencyGraph } from "../types";

export async function bundleStyle(this: Toypack, graph: DependencyGraph) {
   const config = this.getConfig();
   const bundle = new CodeComposer();
   const smg = config.bundle.sourceMap ? new SourceMapGenerator() : null;

   for (const source in graph) {
      const chunk = graph[source];
      if (chunk.type != "style") continue;

      const compiled = compileStyle.call(this, chunk, graph);
      if (!compiled.content) continue;

      bundle.append(compiled.content).breakLine();

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
            bundle.toString(),
            originalContent
         );
      }
   }

   return {
      content: bundle.toString(),
      map: smg ? MapConverter.fromJSON(smg.toString()) : null,
   };
}
