import { parse as babelParse, ParserOptions } from "@babel/parser";
import traverseAST, { Node } from "@babel/traverse";
import { parseError } from "../utils/errors.js";
import { Toypack } from "../Toypack.js";
import { IBabelParseOptions } from "src/config.js";

const emptyAST: Node = babelParse("");

/**
 * Parses and extracts the dependencies of a script asset. Script assets
 * are .js, .ts, .mjs, .cjs, .tsx, and .jsx
 * @returns The AST and dependencies of the asset.
 */
export async function parseScriptAsset(
   this: Toypack,
   source: string,
   content: string
): Promise<IParseScriptResult> {
   const config = this.getConfig();
   const result: IParseScriptResult = {
      dependencies: [] as string[],
      ast: emptyAST,
   };

   const moduleType = source.startsWith("virtual:")
      ? "esm"
      : config.bundle.moduleType;

   // Parse
   try {
      const userBabelOptions = config.babel.parse as IBabelParseOptions;
      const importantBabelOptions: ParserOptions = {
         sourceType: moduleType == "esm" ? "module" : "script",
         sourceFilename: source,
      };
      result.ast = babelParse(content, {
         ...userBabelOptions,
         ...importantBabelOptions,
      });
   } catch (error) {
      this.hooks.trigger("onError", parseError(error as any));

      return result;
   }

   // Extract dependencies
   if (moduleType == "esm") {
      traverseAST(result.ast, {
         ImportDeclaration(scope) {
            result.dependencies.push(scope.node.source.value);
         },
         ExportAllDeclaration(scope) {
            result.dependencies.push(scope.node.source.value);
         },
         ExportNamedDeclaration(scope) {
            if (scope.node.source) {
               result.dependencies.push(scope.node.source.value);
            }
         },
         CallExpression(scope) {
            const argNode = scope.node.arguments[0];
            const callee = scope.node.callee;
            const isDynamicImport = callee.type == "Import";
            if (isDynamicImport && argNode.type == "StringLiteral") {
               result.dependencies.push(argNode.value);
            }
         },
      });
   } else {
      traverseAST(result.ast, {
         CallExpression(scope) {
            const argNode = scope.node.arguments[0];
            const callee = scope.node.callee;
            const isRequire =
               callee.type == "Identifier" && callee.name == "require";
            if (isRequire && argNode.type == "StringLiteral") {
               result.dependencies.push(argNode.value);
            }
         },
      });
   }

   return result;
}

export interface IParseScriptResult {
   dependencies: string[];
   ast: Node;
}
