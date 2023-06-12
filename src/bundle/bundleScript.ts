import { SourceMapGenerator } from "source-map-js";
import { CodeComposer, Toypack } from "../Toypack.js";
import { IDependencyGraph } from "../graph/index.js";
import { compileScript } from "./compileScript.js";
import { mergeMapToBundle } from "./mergeMapToBundle.js";
import * as rt from "./runtime.js";
import MapConverter from "convert-source-map";

export async function bundleScript(this: Toypack, graph: IDependencyGraph) {
   const bundle = new CodeComposer();
   const smg = this.options.bundleOptions.sourceMap
      ? new SourceMapGenerator()
      : null;

   const finalizeBundleContent = () => {
      const bundleClone = bundle.clone();
      bundleClone.prepend(rt.requireFunction());

      const entry = Object.values(graph).find(
         (g) => g.type == "script" && g.isEntry
      );
      if (entry) {
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
      const script = graph[source];
      if (script.type != "script") continue;
      const isChunk = script.chunkSource == source;
      if (!isChunk) continue;

      const compiled = await compileScript.call(this, source, graph);

      const wrapped = rt.moduleWrap(source, compiled.content);
      bundle.breakLine().append(wrapped);

      if (smg && compiled.map) {
         mergeMapToBundle.call(
            this,
            smg,
            compiled.map,
            script.original.source,
            script.original.content,
            compiled.content,
            finalizeBundleContent()
         );
      }
   }

   return {
      content: finalizeBundleContent(),
      map: smg ? MapConverter.fromJSON(smg.toString()) : null
   }
}
