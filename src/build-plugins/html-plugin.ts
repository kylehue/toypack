import {
   parse as parseHTML,
   Node,
   HTMLElement,
   NodeType,
   Options,
} from "node-html-parser";
import { PluginContext, Plugin, Toypack } from "../types.js";
import { getHash } from "../utils/get-hash.js";
import path from "path-browserify";
import { merge } from "lodash-es";

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
   let importMap: Record<string, string> = {};
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
         importMap = text.length ? JSON.parse(text) : {};
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
      importMap,
   };
}

function injectImportMap(
   headNode: HTMLElement,
   importMap: Record<string, string>,
   importMapNode?: Node
) {
   if (importMapNode) {
      // edit the import map if it exists
      const json = JSON.parse(importMapNode.textContent);
      merge(json, importMap);
      importMapNode.textContent = JSON.stringify(json, undefined, 2);
   } else {
      // add the import map if it doesn't exist
      const stringifiedImportMap = JSON.stringify(importMap, undefined, 2);
      headNode.insertAdjacentHTML(
         "afterbegin",
         `<script type="importmap">${stringifiedImportMap}</script>`
      );
   }
}

const symbols = {
   importMap: Symbol("importMap"),
   ast: Symbol("ast"),
};

export default function (options?: HTMLPluginOptions): Plugin {
   return {
      name: "html-plugin",
      extensions: [["script", ".html"]],
      buildStart() {
         // Remove in plugin's cache if the asset no longer exists
         this.cache.forEach((_, source) => {
            if (typeof source == "symbol") return;
            if (this.bundler.getAsset(source)) return;
            this.cache.delete(source);
         });
      },
      load(moduleInfo) {
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

         const compiled = compile.call(
            this,
            moduleInfo.source,
            moduleInfo.content,
            options
         );

         this.cache.set(symbols.importMap, compiled.importMap);
         this.cache.set(symbols.ast, compiled.ast);

         let mainVirtualModule = "";

         // Import dependencies
         for (const depSource of compiled.dependencies) {
            mainVirtualModule += this.getImportCode(depSource) + "\n";
         }

         // Import inline styles as a virtual module
         if (compiled.bundledInlineStyles.length) {
            const styleId = `virtual:${moduleInfo.source}?style&index=${_id++}`;
            this.cache.set(styleId, {
               content: compiled.bundledInlineStyles,
               from: moduleInfo.source,
            });
            mainVirtualModule += this.getImportCode(styleId);
         }

         this.cache.set(moduleInfo.source, {
            resourceDependencies: compiled.resourceDependencies,
         });

         return mainVirtualModule;
      },
      parsed({ chunk, parsed }) {
         const cached = this.cache.get(chunk.source);
         if (!cached) return;
         cached.resourceDependencies?.forEach((item: any) =>
            parsed.dependencies.add(item)
         );
      },
      transformHtml() {
         const ast = this.cache.get(symbols.ast) as HTMLElement | null;
         const importMap = this.cache.get(symbols.importMap);
         if (!ast && !importMap) return;
         const head = ast?.querySelector("head");
         const body = ast?.querySelector("body");

         let hasBody = false;
         let hasHead = false;
         let importMapNode: Node;
         return {
            // assure that head and body exists
            HtmlElement(node) {
               this.traverse({
                  HeadElement() {
                     hasHead = true;
                  },
                  BodyElement() {
                     hasBody = true;
                     this.skip();
                  },
                  ScriptElement(node) {
                     if (
                        node.attributes["type"]?.toLowerCase() !== "importmap"
                     ) {
                        return;
                     }
                     importMapNode = node;
                  },
               });

               if (head && !hasHead) {
                  node.insertAdjacentHTML("afterbegin", `<head></head>`);
               }
               if (body && !hasBody) {
                  node.insertAdjacentHTML("beforeend", `<body></body>`);
               }
            },
            HeadElement(node) {
               if (importMap) {
                  injectImportMap(node, importMap, importMapNode);
               }

               if (head) {
                  node.insertAdjacentHTML("beforeend", head.innerHTML);
               }
            },
            BodyElement(node) {
               if (body) {
                  for (const [attr, value] of Object.entries(body.attributes)) {
                     node.setAttribute(attr, value);
                  }

                  node.insertAdjacentHTML("beforeend", body.innerHTML);
               }
            },
         };
      },
   };
}

type AST = HTMLElement | Node;
type TraverseCallback = (node: AST) => void;
export interface HTMLPluginOptions {
   parserOptions?: Partial<Options>;
}
