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
import { IDependency } from "./graph.js";
import { Toypack } from "./Toypack.js";
import { createSafeName } from "./utils.js";
console.log(availablePlugins, availablePresets);

function compile(bundler: Toypack, dep: IDependency) {
   const result = {
      id: createSafeName(dep.asset.source),
      data: {} as BabelFileResult,
   };

   const { AST } = dep;

   const format = bundler.options.bundleOptions.format;
   if (format == "esm") {
      /* traverseAST(AST, {
         ImportDeclaration(scope) {
            scope.remove();
         },
         ExportAllDeclaration(scope) {
            scope.remove();
         },
         ExportDefaultDeclaration(scope) {
            scope.replaceWith(scope.node.declaration);
         },
         ExportNamedDeclaration(scope) {
            if (scope.node.declaration) {
               scope.replaceWith(scope.node.declaration);
            }
         },
      }); */
      traverseAST(AST, {
         ImportDeclaration(scope) {
            const relativeSource = scope.node.source.value;
            const absoluteSource = dep.dependencyMap[relativeSource].absolute;
            scope.node.source.value = createSafeName(absoluteSource);
         },
         /* ExportAllDeclaration(scope) {
            scope.remove();
         },
         ExportDefaultDeclaration(scope) {
            scope.replaceWith(scope.node.declaration);
         },
         ExportNamedDeclaration(scope) {
            if (scope.node.declaration) {
               scope.replaceWith(scope.node.declaration);
            }
         }, */
      });
   } else {
      /* traverseAST(AST, {
         CallExpression(scope) {
            let argNode = scope.node.arguments[0];
            let callee = scope.node.callee;
            if (
               scope.node.callee.type === "Identifier" &&
               scope.node.callee.name === "require" &&
               scope.parentPath.isVariableDeclarator() &&
               scope.parentPath.parentPath.isVariableDeclaration()
            ) {
               scope.remove();
            }
         },
      }); */
   }

   result.data = transformFromAst(AST, undefined, {
      sourceType: format == "esm" ? "module" : "script",
      compact: false,
      comments: false,
      presets: ["env"],
      plugins: [],
      sourceFileName: dep.asset.source,
      filename: dep.asset.source,
      sourceMaps: bundler.options.bundleOptions.sourceMap,
      envName: bundler.options.bundleOptions.mode,
   } as TransformOptions) as any as BabelFileResult;

   return result;
}

export function bundle(bundler: Toypack, graph: IDependency[]) {
   const result = new MagicString.Bundle();
   const indentPrefix = "  ";

   /* Modules */
   for (let i = graph.length - 1; i >= 0; i--) {
      const dep = graph[i];
      const compilation = compile(bundler, dep);
      const ms = new MagicString.default("");
      result.addSource({
         filename: dep.asset.source,
         content: ms,
      });

      ms
         /* code body */
         .append(`var exports = module.exports;`)
         .append((compilation.data.code || "").replace(/^"use strict";/, ""))
         .append(`\n\nreturn exports;`)

         /* code wrap (iife) */
         .indent(indentPrefix)
         .prepend(`__modules__.${compilation.id} = (function (module) {\n`)
         .append(`\n})({ exports: {} });`)

         /* filename comment */
         .prepend(`\n// ${dep.asset.source.replace(/^\//, "")}\n`);
   }

   /* Main */
   /* code body */
   result.prepend(`function require(source) { return __modules__[source]; }\n`);
   result.prepend(`var __modules__ = {};\n\n`);
   result.prepend(`"use strict";\n\n`);

   /* code wrap */
   result.indent(indentPrefix).prepend("(function () {\n").append("\n })();");
   return result.toString();
}

// export function bundle(bundler: Toypack, graph: IDependency[]) {
//    const result = new MagicString("");

//    for (let i = graph.length - 1; i >= 0; i--) {
//       const dep = graph[i];
//       const compilation = compile(bundler, dep);
//       /* console.log("------------------------------------");
//       console.log(dep.asset.source + ":");
//       console.log();
//       console.log("------------------------------------");
//        */

//       result.append("// " + dep.asset.source.replace(/^\//, "") + "\n");
//       result.append(compilation.code);
//       result.append("\n\n");
//    }

//    return result.toString();
// }
