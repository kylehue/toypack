import { Toypack } from "../Toypack.js";
import { getHash, mergeSourceMaps } from "../utils.js";
import traverseAST, { NodePath, Node, TraverseOptions } from "@babel/traverse";
import { TransformOptions, BabelFileResult } from "@babel/core";
import { transformFromAst } from "@babel/standalone";
import { RawSourceMap } from "source-map-js";
import MapConverter from "convert-source-map";

export async function compileScript(
   this: Toypack,
   source: string,
   AST: Node,
   dependencyMap: Record<string, string>,
   inputSourceMap?: RawSourceMap
) {
   const moduleType = this.options.bundleOptions.moduleType;
   const mode = this.options.bundleOptions.mode;

   const getSafeName = (relativeSource: string) => {
      const absoluteSource = dependencyMap[relativeSource];
      return absoluteSource;
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

   const isStyleSource = (relativeSource: string) => {
      const absoluteSource = dependencyMap[relativeSource];
      if (this.hasExtension("style", absoluteSource)) {
         return true;
      }

      return false;
   };

   // Rename `import` or `require` paths
   if (moduleType == "esm") {
      modifyTraverseOptions({
         ImportDeclaration(scope) {
            if (isStyleSource(scope.node.source.value)) {
               scope.remove();
            } else {
               scope.node.source.value = getSafeName(scope.node.source.value);
            }
         },
         ExportAllDeclaration(scope) {
            if (isStyleSource(scope.node.source.value)) {
               scope.remove();
            } else {
               scope.node.source.value = getSafeName(scope.node.source.value);
            }
         },
         ExportNamedDeclaration(scope) {
            if (scope.node.source?.type != "StringLiteral") return;
            
            if (isStyleSource(scope.node.source.value)) {
               scope.remove();
            } else {
               scope.node.source.value = getSafeName(scope.node.source.value);
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
                  argNode.value = getSafeName(argNode.value);
               }
            }
         },
      });
   }

   const traverseOptions = createTraverseOptionsFromGroup(
      groupTraverseOptions(traverseOptionsArray)
   );

   traverseAST(AST, traverseOptions);

   const userBabelOptions = this.options.babelOptions.transform;

   const importantBabelOptions = {
      sourceType: moduleType == "esm" ? "module" : "script",
      presets: [
         "env",
         ...(userBabelOptions.presets?.filter((v) => v != "env") || []),
      ],
      plugins: userBabelOptions.plugins,
      sourceFileName: source,
      filename: source,
      sourceMaps: !!this.options.bundleOptions.sourceMap,
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
      code: transpiled.code || "",
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