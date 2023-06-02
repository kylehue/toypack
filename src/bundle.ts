import { TransformOptions, BabelFileResult } from "@babel/core";
import { parse as getAST, ParserOptions } from "@babel/parser";
import {
   transformFromAst,
   transform,
   availablePlugins,
   availablePresets,
   registerPlugin,
} from "@babel/standalone";
import traverseAST, { TraverseOptions, Node } from "@babel/traverse";
import * as MagicString from "magic-string";
import { IApplicationDependency, IDependency } from "./graph.js";
import { Toypack } from "./Toypack.js";
import { createSafeName } from "./utils.js";
console.log(availablePlugins, availablePresets);

const indentPrefix = "  ";
// prettier-ignore
const requireFunctionString = 
`// Require function
function require(source) {
   var module = __modules__[source];
   if (!module) {
      module = {};
      __modules__[source] = module;
   }
   return module;
}
`.replaceAll("   ", indentPrefix);

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

   const format = bundler.options.bundleOptions.format;

   function getSafeName(relativeSource: string) {
      const absoluteSource = dependency.dependencyMap[relativeSource].absolute;
      return createSafeName(absoluteSource);
   }

   // Rename `import` or `require` paths to be compatible with the `require` function's algorithm
   if (format == "esm") {
      traverseAST(AST, {
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
      traverseAST(AST, {
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

   const transpiled = transformFromAst(AST, undefined, {
      sourceType: format == "esm" ? "module" : "script",
      compact: false,
      comments: false,
      presets: ["env"],
      plugins: [],
      sourceFileName: dependency.source,
      filename: dependency.source,
      sourceMaps: bundler.options.bundleOptions.sourceMap,
      envName: bundler.options.bundleOptions.mode,
   } as TransformOptions) as any as BabelFileResult;

   result.code = transpiled.code || "";
   result.map = transpiled.map || {};

   return result;
}

export function bundle(bundler: Toypack, graph: IDependency[]) {
   const result = new MagicString.Bundle();

   /* Modules */
   for (let i = graph.length - 1; i >= 0; i--) {
      const dep = graph[i];
      const id = createSafeName(dep.source);

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

      ms
         /* code body */
         .append(`var exports = module.exports;`)
         .append((content || "").replace(/^"use strict";/, ""))
         .append(`\n\nreturn exports;`)

         /* code wrap (iife) */
         .indent(indentPrefix)
         .prepend(`__modules__.${id} = (function (module) {\n`)
         .append(`\n})({ exports: {} });`)

         /* filename comment */
         .prepend(`\n// ${dep.source.replace(/^\//, "")}\n`);

      if (dep.source == graph[0].source) {
         result.append(`\n\nreturn __modules__.${id};`);
      }
   }

   /* Main */
   /* code body */
   result.prepend(requireFunctionString);
   result.prepend(`var __modules__ = {};\n\n`);
   result.prepend(`"use strict";\n\n`);

   /* code wrap */
   result.indent(indentPrefix).prepend("(function () {\n").append("\n })();");
   return result.toString();
}
