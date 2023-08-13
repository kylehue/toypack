import MapConverter from "convert-source-map";
import { compileStyle } from "./compile-style.js";
import { BundleGenerator } from "./BundleGenerator.js";
import type { DependencyGraph, Toypack } from "src/types";

export async function bundleStyle(this: Toypack, graph: DependencyGraph) {
   const bundleGenerator = new BundleGenerator();

   for (const [_, chunk] of graph) {
      if (chunk.type != "style") continue;

      const compiled = await compileStyle.call(this, chunk);
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
