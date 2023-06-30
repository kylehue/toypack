import { codeFrameColumns } from "@babel/code-frame";
import {
   parse as parseHTML,
   Node,
   HTMLElement,
   NodeType,
   Options,
} from "node-html-parser";
import { Loader, Plugin } from "../types.js";
import { getHash } from "../utils/get-hash.js";
import { indexToPosition } from "../utils/find-code-position.js";

const linkTagRelDeps = ["stylesheet", "icon"];
let _id = 0;

function traverse(ast: AST, callback: ITraverseCallback) {
   if (!ast) return;

   callback(ast);
   for (let node of ast.childNodes) {
      traverse(node, callback);
   }
}

function extractDepSourceFromNode(node: AST) {
   let extractedDep: string | null = null;
   if (node.nodeType != NodeType.ELEMENT_NODE) return extractedDep;
   if (!(node instanceof HTMLElement)) return extractedDep;

   // Script tags that has `src` attribute
   if (node.tagName == "SCRIPT" && node.attributes?.src?.length) {
      extractedDep = node.attributes.src;
   }

   // Link tags that has `href` attribute
   if (
      node.tagName == "LINK" &&
      linkTagRelDeps.includes(node.attributes?.rel) &&
      node.attributes?.href?.length
   ) {
      extractedDep = node.attributes.href;
   }

   return extractedDep;
}

function compile(
   source: string,
   content: string,
   htmlPluginOptions?: HTMLPluginOptions
) {
   const htmlAst = parseHTML(content, htmlPluginOptions?.parserOptions);
   const dependencies: string[] = [];
   let bundledInlineStyles = "";
   const errors: string[] = [];
   traverse(htmlAst, (node) => {
      if (!(node instanceof HTMLElement)) return;
      const depSource = extractDepSourceFromNode(node);
      if (depSource) {
         node.remove();
         dependencies.push(depSource);
      }

      // Import maps aren't supported
      if (node.tagName == "SCRIPT" && node.attributes.type == "importmap") {
         const pos = indexToPosition(content, node.range[0]);
         let message =
            "ESM import maps are not supported, please install packages instead.";
         let importMapError =
            message +
            "\n" +
            codeFrameColumns(content, {
               start: pos,
            });
         errors.push(importMapError);
      }

      /**
       * Save the styles so that the bundler can process it.
       * This is necessary because the urls inside it needs to
       * be transformed to blobs urls in dev mode.
       */
      if (node.tagName == "STYLE") {
         bundledInlineStyles += node.structuredText + "\n";
         node.remove();
      }

      if (
         typeof node.attributes.style == "string" &&
         node.attributes.style.length
      ) {
         const nodeId = getHash(source) + _id++;
         const rawCode = node.attributes.style;
         const selector = `${node.tagName.toLocaleLowerCase()}[${nodeId}]`;
         const code = `${selector} {${rawCode}}`;
         bundledInlineStyles += code + "\n";
         node.setAttribute(nodeId, "");
         node.removeAttribute("style");
      }
   });

   return {
      ast: htmlAst,
      dependencies: dependencies,
      bundledInlineStyles,
      errors,
   };
}

function injectAstToHtml(content: string, astToInject: HTMLElement) {
   const htmlAst = parseHTML(content);
   const bodyAst = htmlAst.querySelector("body")!;
   const headAst = htmlAst.querySelector("head")!;

   // Inject body in body
   const bodyToInject = astToInject.querySelector("body");
   if (bodyToInject) {
      bodyToInject.childNodes.forEach((node) => {
         bodyAst.appendChild(node.clone());
      });
      for (const [key, value] of Object.entries(bodyToInject.attributes)) {
         bodyAst.setAttribute(key, value);
      }
   }

   // Inject head in head
   const headToInject = astToInject.querySelector("head");
   headToInject?.childNodes.forEach((node) => {
      headAst.appendChild(node.clone());
   });

   return htmlAst.toString();
}

const htmlPlugin: Plugin = (options?: HTMLPluginOptions) => {
   let mainVirtualModule = "";
   const chunks: Record<string, string> = {};
   let astToInject: HTMLElement | null = null;

   const htmlLoader: Loader = {
      test: /\.html$/,
      compile(dep) {
         if (typeof dep.content != "string") {
            this.error("Blob contents are not supported.");
            return;
         }

         const compiled = compile(dep.source, dep.content, options);
         astToInject = compiled.ast;

         // Import dependencies
         for (const depSource of compiled.dependencies) {
            mainVirtualModule += this.getImportCode(depSource) + "\n";
         }

         // Import inline styles as a virtual module
         if (compiled.bundledInlineStyles.length) {
            const styleVirtualId = `virtual:${getHash(dep.source)}${_id++}.css`;
            chunks[styleVirtualId] = compiled.bundledInlineStyles;
            mainVirtualModule += this.getImportCode(styleVirtualId);
         }

         for (const error of compiled.errors) {
            this.error(error);
         }

         return mainVirtualModule;
      },
   };

   return {
      name: "html-plugin",
      loaders: [htmlLoader],
      extensions: [["script", ".html"]],
      load(dep) {
         if (dep.source in chunks) {
            return chunks[dep.source];
         }
      },
      buildEnd(result) {
         if (!astToInject) return;
         result.html.content = injectAstToHtml(
            result.html.content,
            astToInject
         );
      },
   };
};

export default htmlPlugin;

type AST = HTMLElement | Node;
type ITraverseCallback = (node: AST) => void;
export interface HTMLPluginOptions {
   parserOptions?: Partial<Options>;
}
