import {
   EncodedSourceMap,
   GenMapping,
   toEncodedMap,
} from "@jridgewell/gen-mapping";
import MapConverter from "convert-source-map";
import {
   mergeSourceMapToBundle,
   shouldProduceSourceMap,
} from "../utils/index.js";
import {
   ModuleTransformer,
   getModuleTransformersFromGraph,
} from "../utils/module-transformer.js";
import { transformUrl } from "./transform-url.js";
import type { Toypack, DependencyGraph, StyleModule } from "src/types";

function hasResourceDepChange(graph: DependencyGraph, chunk: StyleModule) {
   for (const [_, depSource] of chunk.dependencyMap) {
      const dep = graph.get(depSource);
      if (!dep?.isResource()) continue;
      if (dep.asset.modified) return true;
   }

   return false;
}

export async function bundleStyle(this: Toypack, graph: DependencyGraph) {
   const moduleTransformers = (await getModuleTransformersFromGraph.call(
      this,
      "style",
      graph
   )) as ModuleTransformer<StyleModule>[];

   const chunks: CompilationChunks = {
      module: new Map(),
   };

   for (const moduleTransformer of moduleTransformers) {
      const { module } = moduleTransformer;
      if (
         !moduleTransformer.needsChange() &&
         !hasResourceDepChange(graph, module)
      ) {
         continue;
      }

      transformUrl.call(this, moduleTransformer);
   }

   // chunks.module
   for (const moduleTransformer of moduleTransformers) {
      const { module } = moduleTransformer;
      chunks.module.set(module.source, moduleTransformer);
   }

   const bundle = bundleChunks.call(this, chunks);

   return {
      content: bundle.content,
      map: bundle.map ? MapConverter.fromObject(bundle.map) : null,
   };
}

function bundleChunks(this: Toypack, chunks: CompilationChunks) {
   const config = this.config;
   const bundle = {
      content: "",
      map: null as EncodedSourceMap | null,
   };

   const sourceMap = new GenMapping();

   const getSourceComment = (source: string) => {
      if (config.bundle.mode == "production") return "";
      return `/* ${source.replace(/^\//, "")} */\n`;
   };

   const lineChar = config.bundle.mode == "production" ? "" : "\n";

   // Modules
   for (const [source, moduleTransformer] of chunks.module) {
      const shouldMap = shouldProduceSourceMap(source, config.bundle.sourceMap);
      const generated = moduleTransformer.generate();

      if (!generated.content.trim().length) continue;

      bundle.content += getSourceComment(source);
      const linePos = bundle.content.split("\n").length;
      bundle.content += generated.content;
      if (bundle.content.length) bundle.content += lineChar.repeat(2);

      if (generated.map && shouldMap) {
         mergeSourceMapToBundle(sourceMap, generated.map, {
            line: linePos,
            column: 0,
         });
      }
   }

   bundle.content = bundle.content.trimEnd();
   bundle.map = bundle.content.length ? toEncodedMap(sourceMap) : null;

   return bundle;
}

export interface CompilationChunks {
   module: Map<string, ModuleTransformer<StyleModule>>;
}
