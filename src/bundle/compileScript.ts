import type {
   TransformOptions,
   BabelFileResult,
   PluginItem,
} from "@babel/core";
import traverseAST, { NodePath, Node, TraverseOptions } from "@babel/traverse";
import { transformFromAst } from "@babel/standalone";
import babelTypes from "@babel/types/lib/index.js";
import MapConverter from "convert-source-map";
import { RawSourceMap } from "source-map-js";
import { Toypack } from "../Toypack.js";
import { mergeSourceMaps, parseURL } from "../utils.js";
import { IDependencyGraph } from "../graph/index.js";
import { IDependencyScript } from "../graph/createDependency.js";

const importantPresets: PluginItem[] = ["env"];
const importantPlugins: PluginItem[] = [
   /* "transform-runtime" */
];

function getChunkSourceFromRelativeSource(
   relativeSource: string,
   script: IDependencyScript,
   graph: IDependencyGraph
) {
   // Try if relative source starts from root
   if (relativeSource.startsWith("/") && graph[relativeSource]) {
      return graph[relativeSource].chunkSource;
   }

   // Try dependency map
   const absoluteSource = script.dependencyMap[relativeSource];
   const fromGraphAbsolute = graph[absoluteSource];
   if (fromGraphAbsolute) {
      return fromGraphAbsolute.chunkSource;
   }

   // Throw error if not found
   throw new Error(`Can't resolve ${relativeSource} from ${script.asset.source}.`);
}

export async function compileScript(
   this: Toypack,
   source: string,
   graph: IDependencyGraph
) {
   const script = graph[source];
   if (script.type != "script") {
      throw new Error("The source to compile must be a valid script.");
   }

   // Check cache
   const bundleMode = this.config.bundle.mode;
   const cached = this.cachedDeps.compiled.get(source + "-" + bundleMode);
   if (cached && !script.asset.modified) {
      return {
         source,
         content: cached.content,
         map: cached.map,
      };
   }

   const { AST, map: inputSourceMap } = script;
   const moduleType = this.config.bundle.moduleType;
   const mode = this.config.bundle.mode;

   const traverseOptionsArray: ITraverseOptions[] = [];
   const modifyTraverseOptions = (traverseOptions: ITraverseOptions) => {
      traverseOptionsArray.push(traverseOptions);
   };

   this.hooks.trigger("onTranspile", {
      AST,
      traverse: modifyTraverseOptions,
      source,
   });

   // Import chunks to main chunk
   if (script.rawChunkDependencies.length > 1) {
      modifyTraverseOptions({
         Program(scope) {
            for (let i = script.rawChunkDependencies.length - 1; i >= 0; i--) {
               const rawChunkSource = script.rawChunkDependencies[i];
               if (rawChunkSource == script.chunkSource) continue;
               if (moduleType == "esm") {
                  const importDeclaration = babelTypes.importDeclaration(
                     [],
                     babelTypes.stringLiteral(rawChunkSource)
                  );
                  scope.unshiftContainer("body", importDeclaration);
               } else {
                  const requireStatement = babelTypes.expressionStatement(
                     babelTypes.callExpression(
                        babelTypes.identifier("require"),
                        [babelTypes.stringLiteral(rawChunkSource)]
                     )
                  );
                  scope.unshiftContainer("body", requireStatement);
               }
            }
         },
      });
   }

   // Rename `import` or `require` paths
   if (moduleType == "esm") {
      modifyTraverseOptions({
         ImportDeclaration(scope) {
            scope.node.source.value = getChunkSourceFromRelativeSource(
               scope.node.source.value,
               script,
               graph
            );
         },
         ExportAllDeclaration(scope) {
            scope.node.source.value = getChunkSourceFromRelativeSource(
               scope.node.source.value,
               script,
               graph
            );
         },
         ExportNamedDeclaration(scope) {
            if (scope.node.source?.type != "StringLiteral") return;

            scope.node.source.value = getChunkSourceFromRelativeSource(
               scope.node.source.value,
               script,
               graph
            );
         },
         CallExpression(scope) {
            const argNode = scope.node.arguments[0];
            const callee = scope.node.callee;
            const isDynamicImport = callee.type == "Import";
            if (isDynamicImport && argNode.type == "StringLiteral") {
               argNode.value = getChunkSourceFromRelativeSource(
                  argNode.value,
                  script,
                  graph
               );
            }
         },
      });
   } else {
      modifyTraverseOptions({
         CallExpression(scope) {
            const argNode = scope.node.arguments[0];
            const callee = scope.node.callee;
            const isRequire =
               callee.type == "Identifier" && callee.name == "require";
            if (isRequire && argNode.type == "StringLiteral") {
               argNode.value = getChunkSourceFromRelativeSource(
                  argNode.value,
                  script,
                  graph
               );
            }
         },
      });
   }

   const traverseOptions = createTraverseOptionsFromGroup(
      groupTraverseOptions(traverseOptionsArray)
   );

   traverseAST(AST, traverseOptions);

   const userBabelOptions = this.config.babel.transform;

   const importantBabelOptions = {
      sourceType: moduleType == "esm" ? "module" : "script",
      presets: [
         ...new Set([...importantPresets, ...(userBabelOptions.presets || [])]),
      ],
      plugins: [
         ...new Set([...importantPlugins, ...(userBabelOptions.plugins || [])]),
      ],
      sourceFileName: source,
      filename: source,
      sourceMaps: !!this.config.bundle.sourceMap,
      envName: mode,
      minified: false,
      comments: mode == "development",
      cloneInputAst: false,
   } as TransformOptions;

   const transpiled = transformFromAst(AST, undefined, {
      ...userBabelOptions,
      ...importantBabelOptions,
   }) as any as BabelFileResult;

   let map = MapConverter.fromObject(transpiled.map).toObject() as RawSourceMap;

   if (inputSourceMap) {
      map = mergeSourceMaps(inputSourceMap, map);
   }

   const result = {
      source,
      content: transpiled.code || "",
      map,
   };

   // Cache
   if (!cached || script.asset.modified) {
      this.cachedDeps.compiled.set(source + "-" + bundleMode, {
         content: result.content,
         map: result.map,
         asset: script.asset,
      });
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
