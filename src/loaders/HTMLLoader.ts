import { CodeComposer, ICompileResult, ILoader, Toypack } from "../Toypack.js";
import {
   parse as parseHTML,
   Node,
   HTMLElement,
   NodeType,
   TextNode,
} from "node-html-parser";

const linkTagRelDeps = ["stylesheet", "icon"];

function traverse(AST: Node, callback: ITraverseCallback) {
   if (!AST) return;

   callback(AST);
   for (let node of AST.childNodes) {
      traverse(node, callback);
   }
}

function extractDependency(this: Toypack, node: AST) {
   let extractedDep: string | null = null;
   if (node.nodeType != NodeType.ELEMENT_NODE) return extractedDep;
   if (!(node instanceof HTMLElement)) return extractedDep;

   // Script tags that has `src` attribute
   if (node.tagName == "SCRIPT" && node.attrs?.src?.length) {
      extractedDep = node.attrs.src;
   }

   // Link tags that has `href` attribute
   if (
      node.tagName == "LINK" &&
      linkTagRelDeps.includes(node.attrs?.rel) &&
      node.attrs?.href?.length
   ) {
      extractedDep = node.attrs.href;
   }

   return extractedDep;
}

function isImportMap(node: HTMLElement) {
   return node.tagName == "SCRIPT" && node.attrs?.type == "importmap";
}

function getImportMap(this: Toypack, node: AST) {
   const importMap: Record<string, string> = {};
   if (!(node instanceof HTMLElement)) return importMap;
   if (isImportMap(node)) {
      let parsedMap = JSON.parse(node.structuredText);
      if (parsedMap?.scopes) {
         this.warn("HTMLLoader doesn't support import map scopes.");
      }

      if (typeof parsedMap?.imports == "object") {
         const imports = parsedMap.imports as Record<string, string>;
         for (let [alias, replacement] of Object.entries(imports)) {
            importMap[alias] = replacement;
         }
      }
   }

   return importMap;
}

function importCode(this: Toypack, source: string) {
   return this.options.bundleOptions.module == "esm"
      ? `import "${source}";`
      : `require("${source}")`;
}

function toJS(node: Node) {
   const code = "";
}

function hasDescendantNode(parent: Node, node: Node) {
   if (!node || !parent) {
      return false;
   }

   if (node === parent) {
      return true;
   }

   const parentNode = node.parentNode;
   if (!parentNode) {
      return false;
   }

   return hasDescendantNode(parent, parentNode);
}

function compile(this: Toypack, content: string) {
   let lastNodeId = 0;
   const dependencies: string[] = [];
   const htmlAST = parseHTML(content);
   const compilation = new CodeComposer();
   const varIdMap = new Map<string, Node>();

   const bodyVarId = "document.body";
   const headVarId = "document.head";
   const bodyAST = htmlAST.querySelector("body");
   const headAST = htmlAST.querySelector("head");

   const getNodeId = (node: Node) => {
      if (node === bodyAST) return bodyVarId;
      if (node === headAST) return headVarId;
      for (const [id, _node] of varIdMap) {
         if (node === _node) return id;
      }
   }

   const addElement = (node: HTMLElement) => {
      const tagName = node.tagName?.toLowerCase();
      if (!tagName) return;
      if (tagName == "body" || tagName == "head") return;
      const varId = "n" + lastNodeId++;

      compilation.append(
         `var ${varId} = document.createElement("${tagName}");`
      );

      // Add attributes
      for (let [key, value] of Object.entries(node.attrs || {})) {
         compilation.append(`${varId}.setAttribute("${key}", "${value}");`);
      }

      varIdMap.set(varId, node);
   };

   const addText = (node: TextNode) => {
      const varId = "n" + lastNodeId++;
      const textContent = node.rawText;
      if (!textContent.trim()) return;
      compilation.append(
         `var ${varId} = document.createTextNode(\`${textContent}\`);`
      );
      varIdMap.set(varId, node);
   };

   const traverseCallback: ITraverseCallback = (node) => {
      const extractedDep = extractDependency.call(this, node);
      if (extractedDep) {
         dependencies.push("./" + extractedDep.replace(/^\//, ""));
         node.remove();
      }

      // Put import maps to alias
      if (this.options.bundleOptions.module == "cjs") {
         this.options.bundleOptions.resolve.alias = {
            ...this.options.bundleOptions.resolve.alias,
            ...getImportMap.call(this, node),
         };
      }

      if (node instanceof HTMLElement && isImportMap(node)) {
         node.remove();
      }

      const stillExists = hasDescendantNode(htmlAST, node);
      if (stillExists) {
         if (node instanceof HTMLElement) {
            addElement(node);
         }

         if (node instanceof TextNode) addText(node);
      }
   };

   if (bodyAST) {
      traverse(bodyAST, traverseCallback);
   }

   if (headAST) {
      traverse(headAST, traverseCallback);
   }

   // Appending
   varIdMap.forEach((node, id) => {
      let parentId = getNodeId(node.parentNode);
      if (!parentId) return;

      compilation.append(`${parentId}.appendChild(${id});`);
   });

   for (const dep of dependencies) {
      compilation.prepend(importCode.call(this, dep)).breakLine();
   }

   return compilation.toString();
}

export default function (): ILoader {
   return function (this: Toypack) {
      this.addExtension("script", ".html");

      return {
         name: "HTMLLoader",
         test: /\.html$/,
         async: true,
         compile: async (data) => {
            let contentToCompile;
            const result: ICompileResult = {
               type: "result",
               content: "",
            };

            if (typeof data.content != "string") {
               contentToCompile = await data.content.text();
            } else {
               contentToCompile = data.content;
            }

            const compiled = compile.call(this, contentToCompile);
            result.content = compiled;

            return result;
         },
      };
   };
}

type AST = HTMLElement | Node;
type ITraverseCallback = (node: HTMLElement | Node) => void;
