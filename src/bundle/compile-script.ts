import type {
   TransformOptions,
   BabelFileResult,
   PluginItem,
} from "@babel/core";
import { transformFromAst } from "@babel/standalone";
import traverseAST, { NodePath, Node, TraverseOptions } from "@babel/traverse";
import { EncodedSourceMap } from "@jridgewell/gen-mapping";
import { Toypack } from "../Toypack.js";
import { DEBUG, mergeSourceMaps, shouldProduceSourceMap } from "../utils";
import { DependencyGraph, ScriptDependency } from "../types.js";

const importantPresets: PluginItem[] = ["env"];
const importantPlugins: PluginItem[] = [
   /* "transform-runtime" */
];

export async function compileScript(
   this: Toypack,
   chunk: ScriptDependency,
   graph: DependencyGraph
): Promise<CompiledScriptResult> {
   const config = this.getConfig();
   const sourceMapConfig = config.bundle.sourceMap;
   const shouldMap = shouldProduceSourceMap(
      chunk.asset.source,
      sourceMapConfig
   );

   // Check cache
   const cached = this._getCache("compiled", chunk.source);

   if (cached && !chunk.asset.modified && cached.content) {
      return {
         source: chunk.source,
         content: cached.content,
         map: cached.map,
      };
   }

   const moduleType = chunk.source.startsWith("/node_modules/")
      ? "esm"
      : config.bundle.moduleType;
   const mode = config.bundle.mode;

   const traverseOptionsArray: ITraverseOptions[] = [];
   const modifyTraverseOptions = (traverseOptions: ITraverseOptions) => {
      traverseOptionsArray.push(traverseOptions);
   };

   this._pluginManager.triggerHook({
      name: "transform",
      args: [
         {
            type: "script",
            chunk: chunk,
            traverse: modifyTraverseOptions,
         },
      ],
      context: {
         bundler: this,
         graph,
         importers: chunk.importers,
         source: chunk.source,
      },
   });

   const traverseOptions = createTraverseOptionsFromGroup(
      groupTraverseOptions(traverseOptionsArray)
   );

   traverseAST(chunk.ast, traverseOptions);

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
   } as TransformOptions;

   const transpiled = transformFromAst(chunk.ast, undefined, {
      ...userBabelOptions,
      ...importantBabelOptions,
   }) as any as BabelFileResult;

   let map: EncodedSourceMap | null = null;
   if (shouldMap) {
      map = transpiled.map as EncodedSourceMap;
      map.sourcesContent = [chunk.content];
      map.sources = [chunk.source];
      if (chunk.map) {
         map = mergeSourceMaps(chunk.map, map);
      }
   }

   const result = {
      source: chunk.source,
      content: transpiled.code || "",
      map,
   };

   // Cache
   if (!cached || chunk.asset.modified) {
      this._setCache("compiled", chunk.source, {
         content: result.content,
         map: result.map,
         importers: chunk.importers,
      });

      DEBUG.debug(
         config.logLevel,
         console.info
      )?.(`Compiling ${chunk.source}...`);
   }

   return result;
}

function groupTraverseOptions(array: ITraverseOptions[]) {
   const groups: ITraverseOptionGroups = {};

   for (const opts of array) {
      let key: Node["type"];
      for (key in opts) {
         let group = groups[key] as ITraverseFunction<typeof key>[];

         // Create group if it doesn't exist
         if (!group) {
            group = [] as ITraverseFunction<typeof key>[];
            (groups as any)[key] = group;
         }

         group.push((opts as any)[key]);
      }
   }

   return groups;
}

function createTraverseOptionsFromGroup(groups: ITraverseOptionGroups) {
   const options: ITraverseOptions = {};

   for (const [key, group] of Object.entries(groups)) {
      options[key as Node["type"]] = (scope, node) => {
         for (const fn of group) {
            (fn as ITraverseFunction<Node["type"]>)(scope, node);
         }
      };
   }

   return options as TraverseOptions;
}

export type ITraverseFunction<T> = (
   path: NodePath<Extract<Node, { type: T }>>,
   node: Node
) => void;

export type ITraverseOptions = {
   [Type in Node["type"]]?: ITraverseFunction<Type>;
};

export type ITraverseOptionGroups = {
   [Type in Node["type"]]?: ITraverseFunction<Type>[];
};

export interface CompiledScriptResult {
   source: string;
   content: string;
   map?: EncodedSourceMap | null;
}
