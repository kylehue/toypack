import MapConverter from "convert-source-map";
import { Toypack } from "../Toypack.js";
import { compileStyle } from "./compile-style.js";
import { DependencyGraph } from "../types.js";
import { BundleGenerator } from "./BundleGenerator.js";

export async function bundleStyle(this: Toypack, graph: DependencyGraph) {
   const bundleGenerator = new BundleGenerator();

   for (const source in graph) {
      const chunk = graph[source];
      if (chunk.type != "style") continue;

      const compiled = compileStyle.call(this, chunk, graph);
      if (!compiled.content) continue;
      bundleGenerator.add(compiled.content, {
         map: compiled.map,
      });
   }

   const bundle = bundleGenerator.generate();

   return {
      content: bundle.content,
      map: bundle.map ? MapConverter.fromObject(bundle.map) : null,
   };
}
