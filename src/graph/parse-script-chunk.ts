import { parse as babelParse, ParserOptions, ParseError } from "@babel/parser";
import traverseAST, { Node, NodePath, TraverseOptions } from "@babel/traverse";
import * as t from "@babel/types";
import { Toypack } from "../Toypack.js";
import { ERRORS } from "../utils";
import { codeFrameColumns } from "@babel/code-frame";

const emptyAST: Node = babelParse("");

const referencePathRegex = /\/ <\s*reference\s+path\s*=\s*['"](.*)['"]\s*\/>/;
const referenceTypesRegex = /\/ <\s*reference\s+types\s*=\s*['"](.*)['"]\s*\/>/;

function getReferenceMatch(str: string) {
   const pathMatch = referencePathRegex.exec(str);
   if (pathMatch?.[1]) {
      return pathMatch[1];
   }

   const typesMatch = referenceTypesRegex.exec(str);
   if (typesMatch?.[1]) {
      return "@types/" + typesMatch[1];
   }
}

/**
 * Parses and extracts the dependencies of a script asset. Script assets
 * are .js, .ts, .mjs, .cjs, .tsx, and .jsx
 * @returns The AST and dependencies of the asset.
 */
export async function parseScriptAsset(
   this: Toypack,
   source: string,
   content: string,
   options?: ParseScriptOptions
): Promise<ParsedScriptResult> {
   const config = this.getConfig();
   const result: ParsedScriptResult = {
      dependencies: [] as string[],
      ast: emptyAST,
   };

   const moduleType =
      source.startsWith("virtual:") || source.startsWith("/node_modules/")
         ? "esm"
         : config.bundle.moduleType;

   const userBabelOptions = config.babel.parse;
   const importantBabelOptions: ParserOptions = {
      sourceType: moduleType == "esm" ? "module" : "script",
      sourceFilename: source,
   };
   const parserOptions: ParserOptions = {
      ...userBabelOptions,
      ...importantBabelOptions,
      ...(options?.parserOptions || {}),
   };

   // Parse
   try {
      result.ast = babelParse(content, parserOptions);
   } catch (error: any) {
      let message = "";
      if (error.loc && error.pos) {
         const result = codeFrameColumns(content, {
            start: error.loc,
         });
         console.dir(error)
         message = `${error.name}: ${error.message} in "${source}"\n${result}`;
      } else {
         message = error;
      }

      this._trigger("onError", ERRORS.parse(message));
      return result;
   }

   let traverseOptions: TraverseOptions = {};

   // Extract dependencies
   if (moduleType == "esm") {
      traverseOptions = {
         ImportDeclaration(path) {
            result.dependencies.push(path.node.source.value);
            options?.inspectDependencies?.(path.node.source, path);
         },
         ExportAllDeclaration(path) {
            result.dependencies.push(path.node.source.value);
            options?.inspectDependencies?.(path.node.source, path);
         },
         ExportNamedDeclaration(path) {
            if (path.node.source) {
               result.dependencies.push(path.node.source.value);
               options?.inspectDependencies?.(path.node.source, path);
            }
         },
         CallExpression(path) {
            const argNode = path.node.arguments[0];
            const callee = path.node.callee;
            const isDynamicImport = callee.type == "Import";
            if (isDynamicImport && argNode.type == "StringLiteral") {
               result.dependencies.push(argNode.value);
               options?.inspectDependencies?.(argNode, path);
            }
         },
      };
   } else {
      traverseOptions = {
         CallExpression(path) {
            const argNode = path.node.arguments[0];
            const callee = path.node.callee;
            const isRequire =
               callee.type == "Identifier" && callee.name == "require";
            if (isRequire && argNode.type == "StringLiteral") {
               result.dependencies.push(argNode.value);
               options?.inspectDependencies?.(argNode, path);
            }
         },
      };
   }

   /**
    * Scan `///<reference [path/types]="..." />` in dts files.
    */
   const isDts = parserOptions.plugins?.find(
      (p) => Array.isArray(p) && p[0] == "typescript" && p[1].dts
   );
   if (isDts && result.ast.comments) {
      for (const comment of result.ast.comments) {
         if (comment.type == "CommentBlock") continue;
         const match = getReferenceMatch(comment.value);
         if (!match) continue;
         // Create a facade node because comments doesn't have one
         const fakeNode = {
            value: match,
         };

         result.dependencies.push(fakeNode.value);
         options?.inspectDependencies?.(fakeNode, result.ast);

         /**
          * inspectDependencies() will be useless here because we passed
          * a fake node. One solution is to change comment's value ourselves.
          */
         comment.value = `/ <reference path="${fakeNode.value}" />`;
      }
   }

   traverseAST(result.ast, traverseOptions);

   result.dependencies = [...new Set(result.dependencies)];

   return result;
}

export interface ParsedScriptResult {
   dependencies: string[];
   sourceMappingUrl?: string;
   ast: Node;
}

export interface ParseScriptOptions {
   parserOptions?: ParserOptions;
   /** Function to mutate the node or path of a dependency. */
   inspectDependencies?: (
      node: t.StringLiteral | { value: string },
      path:
         | NodePath<
              | t.ImportDeclaration
              | t.ExportAllDeclaration
              | t.ExportNamedDeclaration
              | t.CallExpression
           >
         | t.File
   ) => void;
}
