import type { TransformOptions, BabelFileResult } from "@babel/core";
import traverseAST, { NodePath, Node, TraverseOptions } from "@babel/traverse";
import { transformFromAst } from "@babel/standalone";
import babelTypes from "@babel/types";
import MapConverter from "convert-source-map";
import { RawSourceMap } from "source-map-js";
import { Toypack } from "../Toypack.js";
import { mergeSourceMaps, parseURL } from "../utils.js";
import { IDependencyGraph } from "../graph/index.js";

export async function compileScript(
   this: Toypack,
   source: string,
   graph: IDependencyGraph
) {
   const script = graph[source];
   if (script.type != "script") {
      throw new Error("The source to compile must be a valid script.");
   }

   const { dependencyMap, AST, map: inputSourceMap } = script;
   const moduleType = this.config.bundle.moduleType;
   const mode = this.config.bundle.mode;

   const getChunkSourceFromRelativeSource = (relativeSource: string) => {
      const fromGraph = graph[relativeSource];
      if (fromGraph) {
         return fromGraph.chunkSource;
      }

      const parsed = parseURL(relativeSource);
      const absoluteSource = dependencyMap[relativeSource];

      const from = graph[absoluteSource + parsed.query];
      return from.chunkSource;
   };

   const isStyleSource = (relativeSource: string) => {
      let absoluteSource = dependencyMap[relativeSource];

      if (!absoluteSource && graph[relativeSource]) {
         absoluteSource = relativeSource;
      }

      if (this.hasExtension("style", absoluteSource)) {
         return true;
      }

      return false;
   };

   const traverseOptionsArray: ITraverseOptions[] = [];
   const modifyTraverseOptions = (traverseOptions: ITraverseOptions) => {
      traverseOptionsArray.push(traverseOptions);
   };

   await this.hooks.trigger("onTranspile", {
      AST,
      traverse: modifyTraverseOptions,
      source,
   });

   // Import chunks to main chunk
   if (script.rawChunkSources.length > 1) {
      modifyTraverseOptions({
         Program(scope) {
            for (let i = script.rawChunkSources.length - 1; i >= 0; i--) {
               const rawChunkSource = script.rawChunkSources[i];
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
            if (isStyleSource(scope.node.source.value)) {
               scope.remove();
            } else {
               scope.node.source.value = getChunkSourceFromRelativeSource(
                  scope.node.source.value
               );
            }
         },
         ExportAllDeclaration(scope) {
            if (isStyleSource(scope.node.source.value)) {
               scope.remove();
            } else {
               scope.node.source.value = getChunkSourceFromRelativeSource(
                  scope.node.source.value
               );
            }
         },
         ExportNamedDeclaration(scope) {
            if (scope.node.source?.type != "StringLiteral") return;

            if (isStyleSource(scope.node.source.value)) {
               scope.remove();
            } else {
               scope.node.source.value = getChunkSourceFromRelativeSource(
                  scope.node.source.value
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
            const isDynamicImport = callee.type == "Import";
            if (
               (isRequire || isDynamicImport) &&
               argNode.type == "StringLiteral"
            ) {
               if (isStyleSource(argNode.value)) {
                  scope.remove();
               } else {
                  argNode.value = getChunkSourceFromRelativeSource(
                     argNode.value
                  );
               }
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
         "env",
         ...(userBabelOptions.presets?.filter((v) => v != "env") || []),
      ],
      plugins: userBabelOptions.plugins,
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
            (fn as ITraverseFunction<typeof key>)(scope, node);
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
