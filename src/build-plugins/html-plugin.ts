import { codeFrameColumns } from "@babel/code-frame";
import {
   parse as parseHTML,
   Node,
   HTMLElement,
   NodeType,
   Options,
} from "node-html-parser";
import { PluginContext, Loader, Plugin } from "../types.js";
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

const injectHtmlKey = "***html***";
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

interface HTMLModule {
   source: string;
   ast: HTMLElement;
}

function htmlLoader(options?: HTMLPluginOptions): Loader {
   return {
      test: /\.html$/,
      compile(moduleInfo) {
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
            const styleVirtualId = `virtual:${
               moduleInfo.source
            }?style&index=${_id++}`;
            this.setCache(styleVirtualId, {
               type: "style",
               lang: "css",
               content: compiled.bundledInlineStyles,
            });
            mainVirtualModule += this.getImportCode(styleVirtualId);
         }

         this.setCache(moduleInfo.source, {
            source: moduleInfo.source,
            content: mainVirtualModule,
            resourceDependencies: compiled.resourceDependencies,
         });

         this.setCache<HTMLModule>(injectHtmlKey, {
            source: moduleInfo.source,
            ast: compiled.ast,
         });

         return mainVirtualModule;
      },
   };
}

export default function (options?: HTMLPluginOptions): Plugin {
   let injectedHtml: HTMLModule | null = null;
   return {
      name: "html-plugin",
      loaders: [htmlLoader(options)],
      extensions: [["script", ".html"]],
      buildStart() {
         // Remove in plugin's cache if the asset no longer exists
         this.eachCache((_, source) => {
            if (this.bundler.getAsset(source)) return;
            if (source != injectHtmlKey) {
               this.removeCache(source);
            }
            if (injectedHtml?.source == source) {
               this.removeCache(injectHtmlKey);
            }
         });
      },
      load(moduleInfo) {
         if (moduleInfo.type != "virtual") return;
         return this.getCache(moduleInfo.source);
      },
      buildEnd(result) {
         const htmlToInject = this.getCache<HTMLModule>(injectHtmlKey);
         if (!htmlToInject) return;
         injectedHtml = htmlToInject;
         result.html.content = injectAstToHtml(
            result.html.content,
            injectedHtml.ast
         );
      },
      parsed({ chunk, parsed }) {
         const cached = this.getCache(chunk.source);
         if (!cached) return;
         cached.resourceDependencies?.forEach((item: any) =>
            parsed.dependencies.add(item)
         );
      },
   };
}

type AST = HTMLElement | Node;
type ITraverseCallback = (node: AST) => void;
export interface HTMLPluginOptions {
   parserOptions?: Partial<Options>;
}
