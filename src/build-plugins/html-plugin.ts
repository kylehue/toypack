import { codeFrameColumns } from "@babel/code-frame";
import {
   parse as parseHTML,
   Node,
   HTMLElement,
   NodeType,
   Options,
} from "node-html-parser";
import { BuildHookContext, Loader, Plugin } from "../types.js";
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
   this: BuildHookContext,
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

      // Import maps aren't supported
      if (node.tagName == "SCRIPT" && node.attributes.type == "importmap") {
         const pos = indexToPosition(content, node.range[0]);
         let message = [
            "ESM import maps are not supported,",
            "please install packages instead.",
         ].join(" ");
         let importMapError =
            message +
            "\n" +
            codeFrameColumns(content, {
               start: pos,
            });
         this.error(importMapError);
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

export default function (options?: HTMLPluginOptions): Plugin {
   const virtualModules: Record<string, string> = {};
   const compiledModules: Record<
      string,
      {
         source: string;
         configHash: string;
         content: string;
         ast: HTMLElement;
         resourceDependencies: Set<string>;
         virtualModules: Record<string, string>;
      }
   > = {};
   
   const htmlLoader: Loader = {
      test: /\.html$/,
      compile(dep) {
         if (typeof dep.content != "string") {
            this.error("Blob contents are not supported.");
            return;
         }

         let mainVirtualModule = "";
         let astToInject: HTMLElement | null = null;

         const compiled = compile.call(this, dep.source, dep.content, options);
         astToInject = compiled.ast;

         // Import dependencies
         for (const depSource of compiled.dependencies) {
            mainVirtualModule += this.getImportCode(depSource) + "\n";
         }

         // Import inline styles as a virtual module
         if (compiled.bundledInlineStyles.length) {
            const styleVirtualId = `virtual:${getHash(dep.source)}${_id++}.css`;
            virtualModules[styleVirtualId] = compiled.bundledInlineStyles;
            mainVirtualModule += this.getImportCode(styleVirtualId);
         }

         compiledModules[this.getConfigHash() + dep.source] = {
            source: dep.source,
            configHash: this.getConfigHash(),
            content: mainVirtualModule,
            ast: astToInject,
            resourceDependencies: compiled.resourceDependencies,
            virtualModules,
         };

         return mainVirtualModule;
      },
   };

   return {
      name: "html-plugin",
      loaders: [htmlLoader],
      extensions: [["script", ".html"]],
      buildStart() {
         // Remove in plugin's cache if the assets doesn't exist anymore
         for (const [source, compiled] of Object.entries(compiledModules)) {
            if (!this.bundler.getAsset(compiled.source)) {
               for (const vkey in compiled.virtualModules) {
                  delete virtualModules[vkey];
               }

               delete compiledModules[source];
            }
         }
      },
      load(dep) {
         if (dep.type != "virtual") return;
         if (dep.source in virtualModules) {
            return virtualModules[dep.source];
         }
      },
      buildEnd(result) {
         const htmls = Object.values(compiledModules);
         if (!htmls.length) return;
         const html = htmls.find(h => h.configHash == this.getConfigHash());
         if (!html?.ast) return;
         result.html.content = injectAstToHtml(result.html.content, html.ast);
      },
      parsed({ chunk, parsed }) {
         const source = this.getConfigHash() + chunk.source;
         if (source in compiledModules) {
            const load = compiledModules[source];
            parsed.dependencies.push(...load.resourceDependencies);
         }
      },
   };
}

type AST = HTMLElement | Node;
type ITraverseCallback = (node: AST) => void;
export interface HTMLPluginOptions {
   parserOptions?: Partial<Options>;
}
