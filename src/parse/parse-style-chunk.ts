import * as cssTree from "css-tree";
import path from "path-browserify";
import { Toypack } from "../Toypack.js";
import { getUsableResourcePath, ERRORS, isNodeModule, isLocal, isUrl } from "../utils/index.js";

/**
 * Parses and extracts the dependencies of a CSS asset.
 * @returns The AST and dependencies of the asset.
 */
export async function parseStyleAsset(
   this: Toypack,
   source: string,
   content: string,
   options?: ParseStyleOptions
): Promise<ParsedStyleResult> {
   const config = this.getConfig();
   const result: ParsedStyleResult = {
      type: "style",
      dependencies: new Set(),
      ast: {} as cssTree.CssNode,
      urlNodes: [],
   };

   // Parse
   const AST = cssTree.parse(content, {
      ...(options?.parserOptions || {}),
      positions: !!config.bundle.sourceMap,
      filename: source,
      onParseError: (error: any) => {
         let message = error.formattedMessage;
         if (!message) {
            message = `${error.name}: ${error.message}`;

            if (error.line && error.column) {
               message += ` at line ${error.line}, column ${error.column}`;
            }
         }

         message += `\n\nSource file: ${source}`;

         this._trigger("onError", ERRORS.parse(message));
      },
   });

   result.ast = AST;
   
   await this._pluginManager.triggerHook({
      name: "transform",
      args: [
         {
            type: "style",
            traverse: (opts) => {
               cssTree.walk(result.ast, opts);
            },
            source,
            content,
         },
      ],
   });

   // Extract dependencies
   cssTree.walk(AST, (node, item, list) => {
      // property: url(...);
      if (node.type === "Url") {
         let isValidDep = true;
         // Scroll-to-element-id urls are not a dependency
         if (isValidDep && node.value.startsWith("#")) isValidDep = false;
         // No need to add data urls to dependencies
         if (isValidDep && node.value.startsWith("data:")) isValidDep = false;
         // url()'s source path can't be .js or .css.
         if (isValidDep && !this._hasExtension("resource", node.value)) {
            this._trigger(
               "onError",
               ERRORS.parse(
                  `'url()' tokens can't be used to reference ${path.extname(
                     node.value
                  )} files. '${node.value}' is not a valid resource file.`
               )
            );

            isValidDep = false;
         }

         if (isValidDep) {
            result.dependencies.add(node.value);
            options?.inspectDependencies?.(node);
            result.urlNodes.push(node);
         }
      }

      if (node.type === "Atrule" && node.name == "import") {
         // @import "...";
         const atImportValueNode = cssTree.find(
            node,
            (child) => child.type === "String"
         );

         if (
            atImportValueNode &&
            atImportValueNode.type == "String" &&
            atImportValueNode.value
         ) {
            result.dependencies.add(atImportValueNode.value);
            list.remove(item);
            options?.inspectDependencies?.(atImportValueNode);
         }

         // @import url("...");
         const atImportURLValueNode = cssTree.find(
            node,
            (child) => child.type === "Url"
         );

         if (
            atImportURLValueNode &&
            atImportURLValueNode.type == "Url" &&
            atImportURLValueNode.value
         ) {
            result.dependencies.add(atImportURLValueNode.value);
            list.remove(item);
            options?.inspectDependencies?.(atImportURLValueNode);
         }
      }
   });

   return result;
}

export interface ParsedStyleResult {
   type: "style";
   dependencies: Set<string>;
   ast: cssTree.CssNode;
   urlNodes: cssTree.Url[];
}

export interface ParseStyleOptions {
   parserOptions?: Omit<
      cssTree.ParseOptions,
      "positions" | "filename" | "onParseError"
   >;
   inspectDependencies?: (node: cssTree.Url | cssTree.StringNode) => void;
}