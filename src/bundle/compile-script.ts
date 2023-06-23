import type {
   TransformOptions,
   BabelFileResult,
   PluginItem,
} from "@babel/core";
import { transformFromAst } from "@babel/standalone";
import traverseAST, { NodePath, Node, TraverseOptions } from "@babel/traverse";
import MapConverter from "convert-source-map";
import { RawSourceMap } from "source-map-js";
import { Toypack } from "../Toypack.js";
import { mergeSourceMaps } from "../utils";
import { DependencyGraph, ScriptDependency } from "src/types.js";

const importantPresets: PluginItem[] = ["env"];
const importantPlugins: PluginItem[] = [
   /* "transform-runtime" */
];

export async function compileScript(
   this: Toypack,
   chunk: ScriptDependency,
   graph: DependencyGraph,
   
   // source: string,
   // ast: Node,
   // dependencyMap: Record<string, string>,

   // inputSourceMap?: RawSourceMap | null
) {
   // Check cache
   // const bundleMode = this.config.bundle.mode;
   // const cached = this.cachedDeps.compiled.get(source + "-" + bundleMode);
   // if (cached && !script.asset.modified) {
   //    return {
   //       source,
   //       content: cached.content,
   //       map: cached.map,
   //    };
   // }

   const config = this.getConfig();
   const moduleType = config.bundle.moduleType;
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
         importer: chunk.importers[0],
      },
   });

   // Rename imported sources from relative to absolute paths
   if (moduleType == "esm") {
      modifyTraverseOptions({
         ImportDeclaration({ node }) {
            node.source.value = chunk.dependencyMap[node.source.value];
         },
         ExportAllDeclaration({ node }) {
            node.source.value = chunk.dependencyMap[node.source.value];
         },
         ExportNamedDeclaration({ node }) {
            if (node.source?.type != "StringLiteral") return;
            node.source.value = chunk.dependencyMap[node.source.value];
         },
         CallExpression({ node }) {
            const argNode = node.arguments[0];
            const callee = node.callee;
            const isDynamicImport = callee.type == "Import";
            if (isDynamicImport && argNode.type == "StringLiteral") {
               argNode.value = chunk.dependencyMap[argNode.value];
            }
         },
      });
   } else {
      modifyTraverseOptions({
         CallExpression({ node }) {
            const argNode = node.arguments[0];
            const callee = node.callee;
            const isRequire =
               callee.type == "Identifier" && callee.name == "require";
            if (isRequire && argNode.type == "StringLiteral") {
               argNode.value = chunk.dependencyMap[argNode.value];
            }
         },
      });
   }

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
      filename: chunk.source,
      sourceMaps: !!config.bundle.sourceMap,
      envName: mode,
      minified: false,
      cloneInputAst: false,
   } as TransformOptions;

   const transpiled = transformFromAst(chunk.ast, undefined, {
      ...userBabelOptions,
      ...importantBabelOptions,
   }) as any as BabelFileResult;

   let map = MapConverter.fromObject(transpiled.map).toObject() as RawSourceMap;

   if (chunk.map) {
      map = mergeSourceMaps(chunk.map, map);
   }

   const result = {
      source: chunk.source,
      content: transpiled.code || "",
      map,
   };

   // Cache
   // if (!cached || script.asset.modified) {
   //    this.cachedDeps.compiled.set(source + "-" + bundleMode, {
   //       content: result.content,
   //       map: result.map,
   //       asset: script.asset,
   //    });
   // }

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
