import MapConverter from "convert-source-map";
import { SourceMapGenerator } from "source-map-js";
import { CodeComposer, Toypack } from "../Toypack.js";
import { IDependencyGraph } from "../graph/index.js";
import { compileStyle } from "./compileStyle.js";
import { mergeMapToBundle } from "./mergeMapToBundle.js";

export async function bundleStyle(this: Toypack, graph: IDependencyGraph) {
   const bundle = new CodeComposer();
   const smg = this.config.bundle.sourceMap
      ? new SourceMapGenerator()
      : null;

   for (const source in graph) {
      const dep = graph[source];
      if (dep.type != "style") continue;
      if (dep.chunkSource != source) continue;

      const compiled = compileStyle.call(this, source, graph);
      if (!compiled.content) continue;

      bundle.append(compiled.content).breakLine();

      if (smg && compiled.map && typeof dep.asset.content == "string") {
         mergeMapToBundle.call(
            this,
            smg,
            compiled.map,
            dep.asset.source,
            dep.asset.content,
            compiled.content,
            bundle.toString()
         );
      }
   }

   return {
      content: bundle.toString(),
      map: smg ? MapConverter.fromJSON(smg.toString()) : null,
   };
}
