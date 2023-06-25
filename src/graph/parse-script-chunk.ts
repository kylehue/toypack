import { parse as babelParse, ParserOptions } from "@babel/parser";
import traverseAST, { Node, NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Toypack } from "../Toypack.js";
import { ERRORS } from "../utils";

const emptyAST: Node = babelParse("");

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

   const moduleType = source.startsWith("virtual:")
      ? "esm"
      : config.bundle.moduleType;

   // Parse
   try {
      const userBabelOptions = config.babel.parse;
      const importantBabelOptions: ParserOptions = {
         sourceType: moduleType == "esm" ? "module" : "script",
         sourceFilename: source,
      };
      result.ast = babelParse(content, {
         ...userBabelOptions,
         ...importantBabelOptions,
         ...(options?.parserOptions || {}),
      });
   } catch (error) {
      this._trigger("onError", ERRORS.parse(error as any));

      return result;
   }

   // Extract dependencies
   if (moduleType == "esm") {
      traverseAST(result.ast, {
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
      });
   } else {
      traverseAST(result.ast, {
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
      });
   }

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
   inspectDependencies?: (
      node: t.StringLiteral,
      path: NodePath<
         | t.ImportDeclaration
         | t.ExportAllDeclaration
         | t.ExportNamedDeclaration
         | t.CallExpression
      >
   ) => void;
}
