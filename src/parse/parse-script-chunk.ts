import { parse as babelParse, ParserOptions } from "@babel/parser";
import traverseAST, { NodePath, TraverseOptions } from "@babel/traverse";
import {
   File,
   StringLiteral,
   ImportDeclaration,
   ExportAllDeclaration,
   ExportNamedDeclaration,
   CallExpression,
   TSImportType,
   file,
   program,
   Program,
} from "@babel/types";
import { Toypack } from "../Toypack.js";
import { mergeTraverseOptions } from "../utils/index.js";
import { codeFrameColumns } from "@babel/code-frame";
import { Exports, extractExports } from "./extract-exports.js";
import { Imports, extractImports } from "./extract-imports.js";

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
   const config = this.config;
   const result: ParsedScriptResult = {
      type: "script",
      dependencies: new Set(),
      ast: file(program([])),
      exports: {} as Exports,
      imports: {} as Imports,
      programPath: {} as NodePath<Program>,
   };

   const userBabelOptions = config.parser;
   const importantBabelOptions: ParserOptions = {
      sourceType: "module",
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
      if (error.loc) {
         const result = codeFrameColumns(content, {
            start: error.loc,
         });
         message = `${error.name}: ${error.message} in "${source}"\n${result}`;
      } else {
         message = error.message || error;
      }

      throw new Error(message);
   }

   const traverseOptionsArray: TraverseOptions[] = [];
   const traverse = (options: TraverseOptions) => {
      traverseOptionsArray.push(options);
   };

   await this._pluginManager.triggerHook({
      name: "transform",
      args: [
         {
            type: "script",
            traverse,
            source,
            content,
         },
      ],
   });

   // Extract dependencies
   traverse({
      Program(path) {
         result.programPath = path;
      },
      ImportDeclaration(path) {
         result.dependencies.add(path.node.source.value);
         options?.inspectDependencies?.(path.node.source, path);
      },
      ExportAllDeclaration(path) {
         result.dependencies.add(path.node.source.value);
         options?.inspectDependencies?.(path.node.source, path);
      },
      ExportNamedDeclaration(path) {
         if (path.node.source) {
            result.dependencies.add(path.node.source.value);
            options?.inspectDependencies?.(path.node.source, path);
         }
      },
      CallExpression(path) {
         const argNode = path.node.arguments[0];
         const callee = path.node.callee;
         const isDynamicImport = callee.type == "Import";
         if (isDynamicImport && argNode.type == "StringLiteral") {
            result.dependencies.add(argNode.value);
            options?.inspectDependencies?.(argNode, path);
         }
      },
      TSImportType(path) {
         result.dependencies.add(path.node.argument.value);
         options?.inspectDependencies?.(path.node.argument, path);
      },
   });

   result.exports = extractExports(result.ast, traverse);
   result.imports = extractImports(result.ast, traverse);

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

         result.dependencies.add(fakeNode.value);
         options?.inspectDependencies?.(fakeNode, result.ast);

         /**
          * inspectDependencies() will be useless here because we passed
          * a fake node. Solution is to change comment's value ourselves.
          */
         comment.value = `/ <reference path="${fakeNode.value}" />`;
      }
   }

   traverseAST(result.ast, mergeTraverseOptions(traverseOptionsArray));

   return result;
}

export interface ParsedScriptResult {
   type: "script";
   dependencies: Set<string>;
   ast: File;
   exports: Exports;
   imports: Imports;
   programPath: NodePath<Program>;
}

export interface ParseScriptOptions {
   parserOptions?: ParserOptions;
   /** Function to mutate the node or path of a dependency. */
   inspectDependencies?: (
      node: StringLiteral | { value: string },
      path:
         | NodePath<
              | ImportDeclaration
              | ExportAllDeclaration
              | ExportNamedDeclaration
              | CallExpression
              | TSImportType
           >
         | File
   ) => void;
}
