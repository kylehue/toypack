import {
   type TransformOptions,
   type BabelFileResult,
   type PluginItem,
   transformFromAstSync,
} from "@babel/core";
import { transformFromAst } from "@babel/standalone";
import traverseAST, { NodePath, Node, TraverseOptions } from "@babel/traverse";
import { EncodedSourceMap } from "@jridgewell/gen-mapping";
import { Toypack } from "../Toypack.js";
import {
   DEBUG,
   mergeSourceMaps,
   shouldProduceSourceMap,
   createTraverseOptionsFromGroup,
   groupTraverseOptions,
   extractExports,
} from "../utils";
import { DependencyGraph, ScriptDependency } from "../types.js";

const importantPresets: PluginItem[] = [];
const importantPlugins: PluginItem[] = [
   /* "transform-runtime" */
];

export async function compileScript(
   this: Toypack,
   chunk: ScriptDependency,
   graph: DependencyGraph
) {
   const config = this.getConfig();
   const sourceMapConfig = config.bundle.sourceMap;
   const shouldMap = shouldProduceSourceMap(
      chunk.asset.source,
      sourceMapConfig
   );

   // Check cache
   const cached = this._getCache("compiled", chunk.source);

   // if (cached && !chunk.asset.modified && cached.content) {
   //    return {
   //       source: chunk.source,
   //       content: cached.content,
   //       map: cached.map,
   //    };
   // }

   const moduleType = chunk.source.startsWith("/node_modules/")
      ? "esm"
      : config.bundle.moduleType;
   const mode = config.bundle.mode;

   const traverseOptionsArray: TraverseOptions[] = [];
   const traverse = (options: TraverseOptions) => {
      traverseOptionsArray.push(options);
   };

   this._pluginManager.triggerHook({
      name: "transform",
      args: [
         {
            type: "script",
            chunk: chunk,
            traverse,
         },
      ],
      context: {
         bundler: this,
         graph,
         importers: chunk.importers,
         source: chunk.source,
      },
   });

   const extractedExports = extractExports(chunk.ast, traverse);

   traverseAST(
      chunk.ast,
      // group the options so that we don't have to traverse multiple times
      createTraverseOptionsFromGroup(groupTraverseOptions(traverseOptionsArray))
   );

   const userBabelOptions = config.babel.transform;
   const importantBabelOptions = {
      sourceType: moduleType == "esm" ? "module" : "script",
      presets: [
         ...new Set([...importantPresets, ...(userBabelOptions.presets || [])]),
      ],
      plugins: [
         ...new Set([...importantPlugins, ...(userBabelOptions.plugins || [])]),
      ],
      sourceFileName: chunk.source,
      filename:
         chunk.source.split("?")[0] + (chunk.lang ? `.${chunk.lang}` : ""),
      sourceMaps: shouldMap,
      envName: mode,
      minified: false,
      cloneInputAst: false,
      ast: true,
   } as TransformOptions;

   const compiled = transformFromAst(chunk.ast, undefined, {
      ...userBabelOptions,
      ...importantBabelOptions,
   }) as any as BabelFileResult;

   return {
      extractedExports,
      compiled,
   };

   // let map: EncodedSourceMap | null = null;
   // if (shouldMap) {
   //    map = transpiled.map as EncodedSourceMap;
   //    map.sourcesContent = [chunk.content];
   //    map.sources = [chunk.source];
   //    if (chunk.map) {
   //       map = mergeSourceMaps(chunk.map, map);
   //    }
   // }

   // const result = {
   //    source: chunk.source,
   //    content: transpiled.code || "",
   //    map,
   // };

   // // Cache
   // if (!cached || chunk.asset.modified) {
   //    this._setCache("compiled", chunk.source, {
   //       content: result.content,
   //       map: result.map,
   //       importers: chunk.importers,
   //    });

   //    DEBUG.debug(
   //       config.logLevel,
   //       console.info
   //    )?.(`Compiling ${chunk.source}...`);
   // }

   // return result;
}

export interface CompiledScriptResult {
   source: string;
   content: string;
   map?: EncodedSourceMap | null;
}
