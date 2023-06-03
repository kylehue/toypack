import { TransformOptions, BabelFileResult } from "@babel/core";
import {
   transformFromAst,
   availablePlugins,
   availablePresets,
} from "@babel/standalone";
import traverseAST, { TraverseOptions, Node, NodePath } from "@babel/traverse";
import * as MagicString from "magic-string";
import { IApplicationDependency, IDependency } from "./graph.js";
import * as rt from "./runtime.js";
import { Toypack } from "./Toypack.js";
import { getUniqueIdFromString } from "./utils.js";
console.log(availablePlugins, availablePresets);

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

/**
 * Transpiles and finalizes a dependency.
 * @param {Toypack} bundler The bundler instance.
 * @param {IDependency} dependency The dependency to transpiled and finalize.
 * @returns
 */
function transpile(bundler: Toypack, dependency: IApplicationDependency) {
   const result = {
      code: "",
      map: {},
   };

   const { AST } = dependency;

   const format = bundler.options.bundleOptions.module;

   function getSafeName(relativeSource: string) {
      const absoluteSource = dependency.dependencyMap[relativeSource].absolute;

      const shouldMinify =
         bundler.options.bundleOptions.minified ||
         bundler.options.bundleOptions.mode == "production";
      return getUniqueIdFromString(absoluteSource, shouldMinify);
   }

   const traverseOptionsArray: ITraverseOptions[] = [];

   function modifyTraverseOptions(traverseOptions: ITraverseOptions) {
      traverseOptionsArray.push(traverseOptions);
   }

   bundler.hooks.trigger("onTranspile", {
      AST,
      traverse: modifyTraverseOptions,
      dependency,
   });

   // Rename `import` or `require` paths to be compatible with the `require` function's algorithm
   if (format == "esm") {
      modifyTraverseOptions({
         ImportDeclaration(scope) {
            scope.node.source.value = getSafeName(scope.node.source.value);
         },
         ExportAllDeclaration(scope) {
            scope.node.source.value = getSafeName(scope.node.source.value);
         },
         ExportNamedDeclaration(scope) {
            if (scope.node.source?.type == "StringLiteral") {
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
               argNode.value = getSafeName(argNode.value);
            }
         },
      });
   }

   const traverseOptions = createTraverseOptionsFromGroup(
      groupTraverseOptions(traverseOptionsArray)
   );

   traverseAST(AST, traverseOptions);

   const userBabelOptions = bundler.options.babelOptions.transform;

   const importantBabelOptions = {
      sourceType: format == "esm" ? "module" : "script",
      presets: [
         "env",
         ...(userBabelOptions.presets?.filter((v) => v != "env") || []),
      ],
      plugins: userBabelOptions.plugins,
      sourceFileName: dependency.source,
      filename: dependency.source,
      sourceMaps: bundler.options.bundleOptions.sourceMap,
      envName: bundler.options.bundleOptions.mode,
      minified: bundler.options.bundleOptions.minified,
   } as TransformOptions;

   const transpiled = transformFromAst(AST, undefined, {
      ...userBabelOptions,
      ...importantBabelOptions,
   }) as any as BabelFileResult;

   result.code = transpiled.code || "";
   result.map = transpiled.map || {};

   return result;
}

export function bundle(bundler: Toypack, graph: IDependency[]) {
   const result = new MagicString.Bundle();

   const shouldMinify =
      bundler.options.bundleOptions.minified ||
      bundler.options.bundleOptions.mode == "production";

   /* Modules */
   for (let i = graph.length - 1; i >= 0; i--) {
      const dep = graph[i];
      const id = getUniqueIdFromString(dep.source, shouldMinify);

      let content = "";

      if (dep.type == "application") {
         const transpiled = transpile(bundler, dep);
         content = transpiled.code;
      } else {
         // TODO: handle resource compilation
      }

      const ms = new MagicString.default("");
      result.addSource({
         filename: dep.source,
         content: ms,
      });

      /* code body */
      ms.append(`var exports = module.exports;`);
      ms.append((content || "").replace(/^"use strict";/, ""));
      ms.append(`${rt.newLine(2, shouldMinify)}return exports;`);

      /* code wrap (iife) */
      ms.indent(rt.indentPrefix(shouldMinify));
      ms.prepend(
         `_modules_.${id} = (function (module) {${rt.newLine(1, shouldMinify)}`
      );
      ms.append(`${rt.newLine(1, shouldMinify)}})({ exports: {} });`);

      /* filename comment */
      if (!shouldMinify) {
         ms.prepend(`\n// ${dep.source.replace(/^\//, "")}\n`);
      }

      /* return entry module's exports */
      if (dep.source == graph[0].source) {
         result.append(`${rt.newLine(2, shouldMinify)}return _modules_.${id};`);
      }
   }

   /* Main */
   /* code body */
   result.prepend(rt.requireFunction(shouldMinify));
   result.prepend(`var _modules_ = {};${rt.newLine(2, shouldMinify)}`);
   result.prepend(`"use strict";${rt.newLine(2, shouldMinify)}`);

   /* code wrap */
   result.indent(rt.indentPrefix(shouldMinify));
   result.prepend(`(function () {${rt.newLine(1, shouldMinify)}`);
   result.append(`${rt.newLine(1, shouldMinify)} })();`);
   return result.toString();
}
