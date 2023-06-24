import MapConverter from "convert-source-map";
import {
   parse as parseHTML,
   Node,
   HTMLElement,
   NodeType,
   TextNode,
} from "node-html-parser";
import { RawSourceMap, SourceMapGenerator } from "source-map-js";
import { ToypackConfig, CodeComposer, Toypack } from "../Toypack.js";

import { Loader, Plugin } from "../types.js";
import { getHash } from "../utils/get-hash.js";
import { indexToPosition } from "../utils/index-to-position.js";

const linkTagRelDeps = ["stylesheet", "icon"];

function traverse(AST: Node, callback: ITraverseCallback) {
   if (!AST) return;

   callback(AST);
   for (let node of AST.childNodes) {
      traverse(node, callback);
   }
}

function extractDependency(node: AST) {
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

function getImportMap(node: AST) {
   const importMap: Record<string, string> = {};
   if (!(node instanceof HTMLElement)) return importMap;
   if (isImportMap(node)) {
      let parsedMap = JSON.parse(node.structuredText);
      if (parsedMap?.scopes) {
         /** @todo */
         //this.warn("HTMLLoader doesn't support import map scopes.");
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

function getImportCode(source: string) {
   return `require("${source}")`;
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

function compile(config: ToypackConfig, source: string, content: string) {
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

   const smg: SourceMapGenerator | null = !!config.bundle.sourceMap
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
      const extractedDep = extractDependency(node);
      if (extractedDep) {
         dependencies.push({
            value: "./" + extractedDep.replace(/^\//, ""),
            node,
         });
         node.remove();
      }

      // Put import maps to alias
      if (node instanceof HTMLElement && isImportMap(node)) {
         if (config.bundle.moduleType == "cjs") {
            config.bundle.resolve.alias = {
               ...config.bundle.resolve.alias,
               ...getImportMap(node),
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
      compilation.append(`${parentId}.appendChild(${id});`);
   });

   // Deps
   for (const dep of dependencies) {
      const originalPosition = indexToPosition(content, dep.node.range[0]);
      const importCode = getImportCode(dep.value);
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

const htmlPlugin: Plugin = () => {
   let chunks: Record<
      string,
      {
         content: string;
         map?: RawSourceMap | null;
      }
   > = {};

   let config: ToypackConfig;

   const htmlLoader: Loader = {
      test: /\.html$/,
      compile(dep) {
         if (typeof dep.content != "string") {
            this.error("Blob contents are not supported.");
            return;
         }

         const compiled = compile(config, dep.source, dep.content);
         const compiledCSSChunks = compileCSSChunks(compiled.cssChunks, {
            sourceMaps: !!config.bundle.sourceMap,
            originalSource: dep.source,
            originalContent: dep.content,
         });

         // Import css chunks
         for (let i = 0; i < compiledCSSChunks.length; i++) {
            const chunk = compiledCSSChunks[i];
            const chunkSource = `virtual:${dep.source.replace(
               /^\//,
               ""
            )}-${i}.css`;
            chunks[chunkSource] = chunk;
            compiled.content += `\nimport "${chunkSource}";`;
         }

         return {
            content: compiled.content,
            map: compiled.map,
         };
      },
   };

   return {
      name: "html-plugin",
      loaders: [htmlLoader],
      extensions: [["script", ".html"]],
      buildStart(bundler) {
         chunks = {};
         config = bundler.getConfig();
      },
      load(dep) {
         if (!(dep.source in chunks)) return;
         const chunk = chunks[dep.source];
         
         return chunk;
      },
   };
};

export default htmlPlugin;

type AST = HTMLElement | Node;
type ITraverseCallback = (node: AST) => void;
