import Toypack from "@toypack/core/Toypack";
import {
   IAsset,
   CompiledAsset,
   ToypackLoader,
   ParsedAsset,
} from "@toypack/core/types";
import MagicString from "magic-string";
import {
   parse as parseHTML,
   HTMLElement as IHTMLElement,
   Node as INode,
   TextNode as ITextNode,
} from "node-html-parser";
import { isURL } from "@toypack/utils";
import { join } from "path-browserify";

type HTMLNode = INode | IHTMLElement | ITextNode;
function walk(AST: INode, fn: (node: HTMLNode) => void) {
   fn(AST);
   for (let node of AST.childNodes) {
      if (node.nodeType == 1 || node.nodeType == 3) {
         walk(node, fn);
      }
   }
}

export default class HTMLLoader implements ToypackLoader {
   public name = "HTMLLoader";
   public test = /\.html$/;

   public parse(asset: IAsset, bundler: Toypack) {
      let result: ParsedAsset = {
         dependencies: [],
         metadata: {},
      };

      if (typeof asset.content != "string") {
         throw new Error("HTML Parse Error: Content must be string.");
      }

      let AST = parseHTML(asset.content);

      function addToDependencies(id: string) {
         if (id) {
            // If path is not an external url, make sure the path starts from root
            // This avoids the resolver from searching in core modules
            if (!isURL(id)) {
               id = join("/", id);
            }

            result.dependencies.push(id);
         }
      }

      let lastId = 0;
      walk(AST, (node) => {
         if (node instanceof IHTMLElement) {
            // Scripts
            if (node.tagName == "SCRIPT" && node.attrs?.src) {
               addToDependencies(node.attrs?.src);

               // Remove from tree
               node.remove();
            }

            // Styles
            if (node.tagName == "LINK" && node.attrs?.rel == "stylesheet") {
               addToDependencies(node.attrs?.href);

               // Remove from tree
               node.remove();
            }

            // TODO: <a> tag href dependencies?

            // Get body tag
            if (node.tagName == "BODY") {
               result.metadata.body = node;
            }

            // Get head tag
            if (node.tagName == "HEAD") {
               result.metadata.head = node;
            }
         }

         // Assign a unique varId for each node (will be used in compilation)
         (node as any).varId = `_node_${++lastId}`;
      });

      return result;
   }

   public compile(asset: IAsset, bundler: Toypack) {
      let result: CompiledAsset = {
         content: {} as MagicString,
      };

      if (typeof asset.content != "string") {
         throw new Error("HTML Compile Error: Content must be string.");
      }

      let metadata = asset.loaderData.parse?.metadata;

      if (metadata) {
         let chunk = bundler._createMagicString(asset.content);
         chunk.update(0, chunk.length(), "");

         // Transforms HTML AST into a javascript code and appends it to chunk
         function transformAndAppend(node: HTMLNode) {
            let nodeVarId: string = (node as any).varId;
            let parentNodeVarId: string = (node.parentNode as any).varId;
            if (node instanceof IHTMLElement) {
               // Instantiate
               chunk.prepend(
                  `var ${nodeVarId} = document.createElement("${node.rawTagName}");`
               );

               // Add attributes
               for (let [key, value] of Object.entries(node.attrs)) {
                  chunk.append(
                     `${nodeVarId}.setAttribute("${key}", "${value}");`
                  );
               }

               chunk.append(`${parentNodeVarId}.appendChild(${nodeVarId});`);
            } else if (node instanceof ITextNode) {
               if (!node.isWhitespace) {
                  // Instantiate text
                  let textNodeCode = `"".concat(\"${node.rawText
                     .split("\n")
                     .join('").concat("')}\")`;
                  chunk.prepend(
                     `var ${nodeVarId} = document.createTextNode(${textNodeCode});`
                  );

                  chunk.append(`${parentNodeVarId}.appendChild(${nodeVarId});`);
               }
            }
         }

         walk(metadata.head, (node) => {
            if (node != metadata.head) transformAndAppend(node);
         });

         walk(metadata.body, (node) => {
            if (node != metadata.body) {
               transformAndAppend(node);
            } else {
               // Add body attributes
               if (node instanceof IHTMLElement) {
                  let nodeVarId: string = (node as any).varId;
                  for (let [key, value] of Object.entries(node.attrs)) {
                     chunk.append(
                        `${nodeVarId}.setAttribute("${key}", "${value}");`
                     );
                  }
               }
            }
         });

         // Add head and body element variables
         chunk.prepend(
            `let ${metadata.body.varId} = document.body || document.getElementsByTagName("body")[0];`
         );

         chunk.prepend(
            `let ${metadata.head.varId} = document.head || document.getElementsByTagName("head")[0];`
         );

         // Imports
         let dependencies = asset.loaderData.parse?.dependencies;
         if (dependencies) {
            for (let dependency of dependencies) {
               chunk.append(`require("${dependency}");`);
            }
         }

         result.content = chunk;
      } else {
         throw new Error("HTML Compile Error: Asset's parse data is empty.");
      }

      return result;
   }
}
