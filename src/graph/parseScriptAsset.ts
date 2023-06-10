import { parse as babelParse, ParserOptions } from "@babel/parser";
import traverseAST, { Node } from "@babel/traverse";
import { IAssetText } from "../asset.js";
import { parseError } from "../errors.js";
import { Toypack } from "../Toypack.js";

const emptyAST: Node = babelParse("");

/**
 * Parses and extracts the dependencies of a script asset. Script assets
 * are .js, .ts, .mjs, .cjs, .tsx, and .jsx
 * @returns The AST and dependencies of the asset.
 */
export async function parseScriptAsset(
   this: Toypack,
   source: string,
   content: IAssetText["content"]
): Promise<IParseScriptResult> {
   /** @todo fix and test caching */
   // Check cache before parsing
   const cachedResult = this.cachedDeps.parsed.get(source);
   if (cachedResult && cachedResult.type == "script") {
      const cachedAsset = this.getAsset(source);
      if (cachedAsset && !cachedAsset.modified) return cachedResult;
   }

   const result: IParseScriptResult = {
      dependencies: [] as string[],
      AST: emptyAST,
   };

   const moduleType = this.options.bundleOptions.moduleType;

   // Parse
   try {
      const userBabelOptions = this.options.babelOptions.parse;
      const importantBabelOptions: ParserOptions = {
         sourceType: moduleType == "esm" ? "module" : "script",
         sourceFilename: source,
         allowImportExportEverywhere: true,
      };
      result.AST = babelParse(content, {
         ...userBabelOptions,
         ...importantBabelOptions,
      });
   } catch (error) {
      this.hooks.trigger("onError", parseError(error as any));

      return result;
   }

   // Extract dependencies
   if (moduleType == "esm") {
      traverseAST(result.AST, {
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
      });
   } else {
      traverseAST(result.AST, {
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
               result.dependencies.push(argNode.value);
            }
         },
      });
   }

   // Cache
   this.cachedDeps.parsed.set(source, result);

   return result;
}

export interface IParseScriptResult {
   dependencies: string[];
   AST: Node;
}