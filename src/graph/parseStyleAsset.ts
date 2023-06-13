import path from "path-browserify";
import * as cssTree from "css-tree";
import { Toypack } from "../Toypack.js";
import { parseError } from "../errors.js";
import { getHash } from "../utils.js";

/**
 * Parses and extracts the dependencies of a CSS asset.
 * @returns The AST and dependencies of the asset.
 */
export async function parseStyleAsset(
   this: Toypack,
   source: string,
   content: string
): Promise<IParseStyleResult> {
   /** @todo fix and test caching */
   // Check cache before parsing
   // const cachedResult = this.cachedDeps.parsed.get(source);
   // if (cachedResult && cachedResult.type == "style") {
   //    const cachedAsset = this.getAsset(source);
   //    if (cachedAsset && !cachedAsset.modified) return cachedResult;
   // }

   const result: IParseStyleResult = {
      dependencies: [] as string[],
      AST: {} as cssTree.CssNode,
   };

   // Parse
   const AST = cssTree.parse(content, {
      positions: !!this.config.bundle.sourceMap,
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

         this.hooks.trigger("onError", parseError(message));
      },
   });

   result.AST = AST;

   // Extract dependencies
   cssTree.walk(AST, (node, item, list) => {
      // property: url(...);
      if (node.type === "Url") {
         const sourceValue = node.value;
         let isValidDep = true;
         // Scroll-to-element-id urls are not a dependency
         if (isValidDep && sourceValue.startsWith("#")) isValidDep = false;
         // No need to add data urls to dependencies
         if (isValidDep && sourceValue.startsWith("data:")) isValidDep = false;
         // url()'s source path can't be .js or .css.
         if (isValidDep && !this.hasExtension("resource", sourceValue)) {
            this.hooks.trigger(
               "onError",
               parseError(
                  `'url()' tokens can't be used to reference ${path.extname(
                     sourceValue
                  )} files. '${sourceValue}' is not a valid resource file.`
               )
            );

            isValidDep = false;
         }

         if (isValidDep) {
            /**
             * Change source path based on bundle mode.
             * Development mode is gonna use Blob urls for resources.
             * Production mode is gonna use external urls.
             */
            const resourceUseableSource = this.resourceSourceToUseableSource(
               "./" + sourceValue.replace(/^\//, ""),
               path.dirname(source)
            );

            if (resourceUseableSource) {
               node.value = resourceUseableSource;
            }

            result.dependencies.push(sourceValue);
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
            result.dependencies.push(path.join("/", atImportValueNode.value));
            list.remove(item);
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
            result.dependencies.push(
               path.join("/", atImportURLValueNode.value)
            );
            list.remove(item);
         }
      }
   });

   //this.cachedDeps.parsed.set(source, result);

   return result;
}

export interface IParseStyleResult {
   dependencies: string[];
   AST: cssTree.CssNode;
}
