import { codeFrameColumns } from "@babel/code-frame";
import {
   parse as parseHTML,
   Node,
   HTMLElement,
   NodeType,
   Options,
} from "node-html-parser";
import { PluginContext, Plugin, Toypack } from "../types.js";
import { getHash } from "../utils/get-hash.js";
import { indexToPosition } from "../utils/find-code-position.js";
import path from "path-browserify";

const resourceSrcAttrTags = [
   "EMBED",
   "AUDIO",
   "IMG",
   "INPUT",
   "SOURCE",
   "TRACK",
   "VIDEO",
];

const linkTagRelDeps = ["stylesheet", "icon"];
let _id = 0;

function traverse(ast: AST, callback: TraverseCallback) {
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
   this: PluginContext,
   source: string,
   content: string,
   htmlPluginOptions?: HTMLPluginOptions
) {
   const htmlAst = parseHTML(content, htmlPluginOptions?.parserOptions);
   const dependencies = new Set<string>();
   const resourceDependencies = new Set<string>();
   let bundledInlineStyles = "";
   traverse(htmlAst, (node) => {
      if (!(node instanceof HTMLElement)) return;
      const depSource = extractDepSourceFromNode(node);
      if (depSource) {
         node.remove();
         dependencies.add(depSource);
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

      /**
       * Add import maps to config
       */
      if (node.tagName == "SCRIPT" && node.attributes.type == "importmap") {
         node.remove();
         const text = node.structuredText.trim();
         this.bundler.setConfig({
            bundle: {
               importMap: text.length ? JSON.parse(text) : {},
            },
         });
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

      /**
       * As for html elements with `src` attribute, we can process the
       * urls ourselves.
       */
      if (resourceSrcAttrTags.includes(node.tagName) && node.attributes.src) {
         const relativeSource = "./" + node.attributes.src;
         const usableSource = this.getUsableResourcePath(
            relativeSource,
            path.dirname(source)
         );

         if (usableSource) {
            node.setAttribute("src", usableSource);
            resourceDependencies.add(relativeSource);
         }
      }
   });

   return {
      ast: htmlAst,
      dependencies,
      resourceDependencies,
      bundledInlineStyles,
   };
}

function injectAstToHtml(bundler: Toypack, astToInject: HTMLElement) {
   // Inject body in body
   let body: string[] = [];
   let head: string[] = [];
   let bodyAttributes: Record<string, string> = {};
   const bodyToInject = astToInject.querySelector("body");
   bodyToInject?.childNodes.forEach((node) => {
      const str = node.toString();
      if (!str.trim().length) return;
      body.push(str);
   });

   bodyAttributes = bodyToInject?.attributes || {};

   const headToInject = astToInject.querySelector("head");
   headToInject?.childNodes.forEach((node) => {
      const str = node.toString();
      if (!str.trim().length) return;
      head.push(str);
   });

   bundler.setConfig({
      bundle: {
         template: {
            head,
            body,
            bodyAttributes,
         },
      },
   });
}

export default function (options?: HTMLPluginOptions): Plugin {
   return {
      name: "html-plugin",
      extensions: [["script", ".html"]],
      buildStart() {
         // Remove in plugin's cache if the asset no longer exists
         this.cache.forEach((_, source) => {
            if (this.bundler.getAsset(source)) return;
            this.cache.delete(source);
         });
      },
      load: {
         handler(moduleInfo) {
            const cached = this.cache.get(moduleInfo.source);
            if (typeof cached?.content === "string") {
               return {
                  type: "style",
                  content: cached.content,
               };
            }

            // guard
            const isHtml = /\.html$/.test(moduleInfo.source.split("?")[0]);
            if (!isHtml) return;
            
            if (typeof moduleInfo.content != "string") {
               this.emitError("Blob contents are not supported.");
               return;
            }

            let mainVirtualModule = "";

            const compiled = compile.call(
               this,
               moduleInfo.source,
               moduleInfo.content,
               options
            );

            // Import dependencies
            for (const depSource of compiled.dependencies) {
               mainVirtualModule += this.getImportCode(depSource) + "\n";
            }

            // Import inline styles as a virtual module
            if (compiled.bundledInlineStyles.length) {
               const styleId = `virtual:${
                  moduleInfo.source
               }?style&index=${_id++}`;
               this.cache.set(styleId, {
                  content: compiled.bundledInlineStyles,
                  from: moduleInfo.source,
               });
               mainVirtualModule += this.getImportCode(styleId);
            }

            this.cache.set(moduleInfo.source, {
               resourceDependencies: compiled.resourceDependencies,
            });

            injectAstToHtml(this.bundler, compiled.ast);

            return mainVirtualModule;
         },
      },
      parsed({ chunk, parsed }) {
         const cached = this.cache.get(chunk.source);
         if (!cached) return;
         cached.resourceDependencies?.forEach((item: any) =>
            parsed.dependencies.add(item)
         );
      },
   };
}

type AST = HTMLElement | Node;
type TraverseCallback = (node: AST) => void;
export interface HTMLPluginOptions {
   parserOptions?: Partial<Options>;
}
