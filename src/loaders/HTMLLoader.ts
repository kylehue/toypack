import { CodeComposer, ILoader, ILoaderResult, Toypack } from "../Toypack.js";
import {
   parse as parseHTML,
   Node,
   HTMLElement,
   NodeType,
   TextNode,
} from "node-html-parser";
import { RawSourceMap, SourceMapGenerator } from "source-map-js";
import MapConverter from "convert-source-map";
import { getHash, indexToPosition } from "../utils.js";

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
   const regex = new RegExp(
      `${attr}\\s*=\\s*['\"]${value.replace(
         /[-[\]{}()*+?.,\\^$|#\s]/g,
         "\\$&"
      )}['\"]`,
      "i"
   );
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

   const cssChunks: {
      content: string;
      range: [number, number];
      inline?: {
         id: string;
         tagName: string;
      };
   }[] = [];

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

   const addElement = (
      node: HTMLElement,
      attributes: Record<string, string>
   ) => {
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
      for (let [attr, value] of Object.entries(attributes || {})) {
         compilation.append(`${varId}.setAttribute("${attr}", "${value}");`);
         const attributeIndex = getAttrIndexInLine(attr, value, line);

         if (attributeIndex >= 0) {
            smg?.addMapping({
               source,
               original: {
                  line: originalPosition.line,
                  column: attributeIndex,
               },
               generated: {
                  line: compilation.getTotalLines(),
                  column: 0,
               },
               name: attr,
            });
         }
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

      if (originalPosition.line >= 0 && originalPosition.column >= 0) {
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

      // Put style tags in css chunks
      if (node instanceof HTMLElement && node.tagName == "STYLE") {
         cssChunks.push({
            content: node.textContent,
            range: [...node.range],
         });

         node.remove();
      }

      // Put inline styles in css chunks
      const attrsCopy =
         node instanceof HTMLElement ? Object.assign({}, node.attributes) : {};
      if (node instanceof HTMLElement && typeof attrsCopy.style == "string") {
         const styleAttrIndex = getAttrIndexInLine(
            "style",
            attrsCopy.style,
            node.outerHTML.trim().split("\n").join(" ")
         );
         const attrRange: [number, number] = [
            node.range[0] + styleAttrIndex,
            node.range[1],
         ];
         const id = getHash(attrRange.toString());
         attrsCopy[id] = "";
         cssChunks.push({
            content: attrsCopy.style,
            range: attrRange,
            inline: {
               id,
               tagName: node.tagName.toLowerCase(),
            },
         });

         delete attrsCopy.style;
      }

      const stillExists = hasDescendantNode(htmlAST, node);
      if (stillExists) {
         if (node instanceof HTMLElement) {
            addElement(node, attrsCopy);
         }

         if (node instanceof TextNode) addText(node);
      }
   };

   if (headAST) {
      traverse(headAST, traverseCallback);
   }

   if (bodyAST) {
      traverse(bodyAST, traverseCallback);
      const originalPosition = indexToPosition(content, bodyAST.range[0]);
      const line = content.split("\n")[originalPosition.line - 1];

      // Add body attributes
      for (const [attr, value] of Object.entries(bodyAST.attributes)) {
         compilation.append(
            `${bodyVarId}.setAttribute("${attr}", "${value}");`
         );
         const attributeIndex = getAttrIndexInLine(attr, value, line);
         if (attributeIndex >= 0) {
            smg?.addMapping({
               source,
               original: {
                  line: originalPosition.line,
                  column: attributeIndex,
               },
               generated: {
                  line: compilation.getTotalLines(),
                  column: 0,
               },
               name: attr,
            });
         }
      }
   }

   // Appending the nodes
   varIdMap.forEach((node, id) => {
      let parentId = getNodeId(node.parentNode);
      if (!parentId) return;
      const originalPosition = indexToPosition(content, node.range[0]);
      compilation.append(`${parentId}.appendChild(${id});`);
      if (originalPosition.line >= 0 && originalPosition.column >= 0) {
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
      }
   });

   // Deps
   for (const dep of dependencies) {
      const originalPosition = indexToPosition(content, dep.node.range[0]);
      const importCode = getImportCode.call(this, dep.value);
      compilation.append(importCode);
      if (originalPosition.line >= 0 && originalPosition.column >= 0) {
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
      }

      compilation.breakLine();
   }

   return {
      map: smg ? MapConverter.fromJSON(smg.toString()).toObject() : null,
      content: compilation.toString(),
      cssChunks,
   };
}

function compileCSSChunks(
   cssChunks: ReturnType<typeof compile>["cssChunks"],
   config: {
      sourceMaps: boolean;
      originalSource: string;
      originalContent: string;
   }
) {
   const chunks: { content: string; map?: RawSourceMap }[] = [];
   for (const cssChunk of cssChunks) {
      const smg = config.sourceMaps ? new SourceMapGenerator() : null;
      if (cssChunk.inline) {
         cssChunk.content = `${cssChunk.inline.tagName}[${cssChunk.inline.id}] { ${cssChunk.content} }`;
      }

      if (smg) {
         const cssChunkLines = cssChunk.content.split("\n");
         const originalPosition = indexToPosition(
            config.originalContent,
            cssChunk.range[0]
         );
         smg.setSourceContent(config.originalSource, config.originalContent);
         if (originalPosition.line >= 0 && originalPosition.column >= 0) {
            for (let i = 0; i < cssChunkLines.length; i++) {
               const line = cssChunkLines[i];
               const linePos = line.indexOf(line.trim());
               if (linePos === -1) continue;
               smg.addMapping({
                  original: {
                     line: originalPosition.line + i,
                     column: !cssChunk.inline
                        ? linePos
                        : originalPosition.column,
                  },
                  generated: {
                     line: i + 1,
                     column: linePos,
                  },
                  source: config.originalSource,
               });
            }
         }
      }

      chunks.push({
         content: cssChunk.content,
         map: smg ? MapConverter.fromJSON(smg.toString()).toObject() : null,
      });
   }

   return chunks;
}

export default function (): ILoader {
   return function (this: Toypack) {
      this.addExtension("script", ".html");
      const sourceMapConfig = this.config.bundle.sourceMap;

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
            const compiledCSSChunks = compileCSSChunks(compiled.cssChunks, {
               sourceMaps: !!sourceMapConfig,
               originalSource: data.source,
               originalContent: contentToCompile,
            });

            const result: ILoaderResult = {
               mainLang: "js",
               contents: {
                  js: [
                     {
                        content: compiled.content,
                        map: compiled.map,
                     },
                  ],
                  css: compiledCSSChunks,
               },
            };

            return result;
         },
      };
   };
}

type AST = HTMLElement | Node;
type ITraverseCallback = (node: AST) => void;
