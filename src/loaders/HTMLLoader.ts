import { CodeComposer, ILoader, ILoaderResult, Toypack } from "../Toypack.js";
import {
   parse as parseHTML,
   Node,
   HTMLElement,
   NodeType,
   TextNode,
} from "node-html-parser";
import { SourceMapGenerator } from "source-map-js";
import MapConverter from "convert-source-map";
import { indexToPosition } from "../utils.js";

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

function isImportMap(node: HTMLElement) {
   return node.tagName == "SCRIPT" && node.attributes?.type == "importmap";
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

function getImportCode(this: Toypack, source: string) {
   return this.config.bundle.moduleType == "esm"
      ? `import "${source}";`
      : `require("${source}")`;
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

function getAttrIndexInLine(attr: string, value: string, lineContent: string) {
   const regex = new RegExp(`${attr}\\s*=\\s*['\"]${value}['\"]`, "i");
   const match = lineContent.match(regex);
   if (match) {
      return match.index || -1;
   }

   return -1;
}

function compile(this: Toypack, source: string, content: string) {
   let lastNodeId = 0;
   const dependencies: {
      value: string;
      node: Node;
   }[] = [];
   const htmlAST = parseHTML(content);
   const compilation = new CodeComposer();
   const varIdMap = new Map<string, Node>();

   const bodyVarId = "document.body";
   const headVarId = "document.head";
   const bodyAST = htmlAST.querySelector("body");
   const headAST = htmlAST.querySelector("head");

   const smg: SourceMapGenerator | null = !!this.config.bundle.sourceMap
      ? new SourceMapGenerator()
      : null;
   smg?.setSourceContent(source, content);

   const getNodeId = (node: Node) => {
      if (node === bodyAST) return bodyVarId;
      if (node === headAST) return headVarId;
      for (const [id, _node] of varIdMap) {
         if (node === _node) return id;
      }
   };

   const addElement = (node: HTMLElement) => {
      const tagName = node.tagName?.toLowerCase();
      if (!tagName) return;
      if (tagName == "body" || tagName == "head") return;
      const originalPosition = indexToPosition(content, node.range[0]);
      const line = content.split("\n")[originalPosition.line - 1];
      const varId = "n" + lastNodeId++;
      compilation.append(
         `var ${varId} = document.createElement("${tagName}");`
      );

      smg?.addMapping({
         source,
         original: {
            line: originalPosition.line,
            column: originalPosition.column,
         },
         generated: {
            line: compilation.getTotalLines(),
            column: 0,
         },
         name: node.tagName.toLowerCase(),
      });

      // Add attributes
      for (let [attr, value] of Object.entries(node.attributes || {})) {
         compilation.append(`${varId}.setAttribute("${attr}", "${value}");`);
         /** @todo find a better way to find the index of an attribute in a line */
         const attributeIndex = getAttrIndexInLine(attr, value, line);

         smg?.addMapping({
            source,
            original: {
               line: originalPosition.line,
               column: attributeIndex >= 0 ? attributeIndex : 0,
            },
            generated: {
               line: compilation.getTotalLines(),
               column: 0,
            },
            name: attr,
         });
      }

      varIdMap.set(varId, node);
   };

   const addText = (node: TextNode) => {
      const varId = "n" + lastNodeId++;
      const textContent = node.rawText;
      if (!textContent.trim()) return;
      const originalPosition = indexToPosition(content, node.range[0]);
      const codeToAppend = `var ${varId} = document.createTextNode(\`${textContent}\`);`;
      compilation.append(codeToAppend);

      const lines = codeToAppend.split("\n");
      for (let i = 0; i < lines.length; i++) {
         smg?.addMapping({
            source,
            original: {
               line: originalPosition.line,
               column: originalPosition.column,
            },
            generated: {
               line: compilation.getTotalLines() + 1 - lines.length + i,
               column: 0,
            },
         });
      }

      varIdMap.set(varId, node);
   };

   const traverseCallback: ITraverseCallback = (node) => {
      const extractedDep = extractDependency.call(this, node);
      if (extractedDep) {
         dependencies.push({
            value: "./" + extractedDep.replace(/^\//, ""),
            node,
         });
         node.remove();
      }

      // Put import maps to alias
      if (node instanceof HTMLElement && isImportMap(node)) {
         if (this.config.bundle.moduleType == "cjs") {
            this.config.bundle.resolve.alias = {
               ...this.config.bundle.resolve.alias,
               ...getImportMap.call(this, node),
            };
         }

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

   if (headAST) {
      traverse(headAST, traverseCallback);
   }

   if (bodyAST) {
      traverse(bodyAST, traverseCallback);
   }

   // Appending the nodes
   varIdMap.forEach((node, id) => {
      let parentId = getNodeId(node.parentNode);
      if (!parentId) return;
      const originalPosition = indexToPosition(content, node.range[0]);
      compilation.append(`${parentId}.appendChild(${id});`);
      smg?.addMapping({
         source,
         original: {
            line: originalPosition.line,
            column: originalPosition.column,
         },
         generated: {
            line: compilation.getTotalLines(),
            column: 0,
         },
         name:
            node instanceof HTMLElement
               ? node.tagName.toLowerCase()
               : undefined,
      });
   });

   // Deps
   for (const dep of dependencies) {
      const originalPosition = indexToPosition(content, dep.node.range[0]);
      const importCode = getImportCode.call(this, dep.value);
      compilation.append(importCode);

      smg?.addMapping({
         source,
         original: {
            line: originalPosition.line,
            column: originalPosition.column,
         },
         generated: {
            line: compilation.getTotalLines(),
            column: 0,
         },
      });

      compilation.breakLine();
   }

   return {
      map: smg ? MapConverter.fromJSON(smg.toString()).toObject() : null,
      content: compilation.toString(),
   };
}

export default function (): ILoader {
   return function (this: Toypack) {
      this.addExtension("script", ".html");

      return {
         name: "HTMLLoader",
         test: /\.html$/,
         compile: async (data) => {
            let contentToCompile;
            if (typeof data.content != "string") {
               contentToCompile = await data.content.text();
            } else {
               contentToCompile = data.content;
            }

            const compiled = compile.call(this, data.source, contentToCompile);

            const result: ILoaderResult = {
               mainLang: "js",
               contents: {
                  js: [
                     {
                        content: compiled.content,
                        map: compiled.map,
                     },
                  ],
               },
            };

            return result;
         },
      };
   };
}

type AST = HTMLElement | Node;
type ITraverseCallback = (node: AST) => void;
