import { TransformOptions, BabelFileResult } from "@babel/core";
import {
   transform,
   transformFromAst,
   availablePlugins,
   availablePresets,
} from "@babel/standalone";
import traverseAST, { TraverseOptions, Node, NodePath } from "@babel/traverse";
import postcss, { Root } from "postcss";
import * as MagicString from "magic-string";
import {
   IDependency,
   IDependencyMap,
   IScriptDependency,
   IStyleDependency,
} from "./graph.js";
import * as rt from "./runtime.js";
import { Toypack } from "./Toypack.js";
import { btoa, getUniqueIdFromString, isJS } from "./utils.js";
import path from "path-browserify";
import {
   SourceMapConsumer,
   SourceMapGenerator,
   RawSourceMap,
} from "source-map-js";
import MapCombiner from "combine-source-map";
import MapConverter from "convert-source-map";
import mergeSourceMap from "merge-source-map";
import lineColumn from "line-column";
console.log(availablePlugins, availablePresets);

export type ITraverseFunction<T> = (
   path: NodePath<Extract<Node, { type: T }>>,
   node: Node
) => void;

export type ITraverseOptions = {
   [Type in Node["type"]]?: ITraverseFunction<Type>;
};

export type ITraverseOptionGroups = {
   [Type in Node["type"]]?: ITraverseFunction<Type>[];
};

function groupTraverseOptions(array: ITraverseOptions[]) {
   const groups: ITraverseOptionGroups = {};

   for (const opts of array) {
      let key: Node["type"];
      for (key in opts) {
         let group = groups[key] as ITraverseFunction<typeof key>[];

         // Create group if it doesn't exist
         if (!group) {
            group = [] as ITraverseFunction<typeof key>[];
            (groups as any)[key] = group;
         }

         group.push((opts as any)[key]);
      }
   }

   return groups;
}

function createTraverseOptionsFromGroup(groups: ITraverseOptionGroups) {
   const options: ITraverseOptions = {};

   for (const [key, group] of Object.entries(groups)) {
      options[key as Node["type"]] = (scope, node) => {
         for (const fn of group) {
            (fn as ITraverseFunction<typeof key>)(scope, node);
         }
      };
   }

   return options as TraverseOptions;
}

/**
 * Transpile a Babel AST.
 */
function transpileAST(
   bundler: Toypack,
   source: string,
   AST: Node,
   depMap: IDependencyMap
) {
   const format = bundler.options.bundleOptions.module;

   function getSafeName(relativeSource: string) {
      const absoluteSource = depMap[relativeSource].absolute;
      return getUniqueIdFromString(absoluteSource);
   }

   const traverseOptionsArray: ITraverseOptions[] = [];

   function modifyTraverseOptions(traverseOptions: ITraverseOptions) {
      traverseOptionsArray.push(traverseOptions);
   }

   bundler.hooks.trigger("onTranspile", {
      AST,
      traverse: modifyTraverseOptions,
      source,
   });

   function isStyleSource(relativeSource: string) {
      const absoluteSource = depMap[relativeSource].absolute;
      if (bundler.extensions.style.includes(path.extname(absoluteSource))) {
         return true;
      }

      return false;
   }

   // Rename `import` or `require` paths to be compatible with the `require` function's algorithm
   if (format == "esm") {
      modifyTraverseOptions({
         ImportDeclaration(scope) {
            if (isStyleSource(scope.node.source.value)) {
               scope.remove();
            } else {
               scope.node.source.value = getSafeName(scope.node.source.value);
            }
         },
         ExportAllDeclaration(scope) {
            if (isStyleSource(scope.node.source.value)) {
               scope.remove();
            } else {
               scope.node.source.value = getSafeName(scope.node.source.value);
            }
         },
         ExportNamedDeclaration(scope) {
            if (scope.node.source?.type != "StringLiteral") return;

            if (isStyleSource(scope.node.source.value)) {
               scope.remove();
            } else {
               scope.node.source.value = getSafeName(scope.node.source.value);
            }
         },
      });
   } else {
      modifyTraverseOptions({
         CallExpression(scope) {
            const argNode = scope.node.arguments[0];
            const callee = scope.node.callee;
            const isRequire =
               callee.type == "Identifier" && callee.name == "require";
            const isDynamicImport = callee.type == "Import";
            if (
               (isRequire || isDynamicImport) &&
               argNode.type == "StringLiteral"
            ) {
               if (isStyleSource(argNode.value)) {
                  scope.remove();
               } else {
                  argNode.value = getSafeName(argNode.value);
               }
            }
         },
      });
   }

   const traverseOptions = createTraverseOptionsFromGroup(
      groupTraverseOptions(traverseOptionsArray)
   );

   traverseAST(AST, traverseOptions);

   const userBabelOptions = bundler.options.babelOptions.transform;

   const importantBabelOptions = {
      sourceType: format == "esm" ? "module" : "script",
      presets: [
         "env",
         ...(userBabelOptions.presets?.filter((v) => v != "env") || []),
      ],
      plugins: userBabelOptions.plugins,
      sourceFileName: source,
      filename: source,
      sourceMaps: bundler.options.bundleOptions.sourceMap,
      envName: bundler.options.bundleOptions.mode,
      minified: bundler.options.bundleOptions.minified,
      comments: bundler.options.bundleOptions.minified,
   } as TransformOptions;

   const transpiled = transformFromAst(AST, undefined, {
      ...userBabelOptions,
      ...importantBabelOptions,
   }) as any as BabelFileResult;

   const result = {
      code: transpiled.code || "",
      map: transpiled.map
         ? ({
              version: "3",
              sources: transpiled.map.sources,
              sourcesContent: transpiled.map.sourcesContent,
              names: transpiled.map.names,
              mappings: transpiled.map.mappings,
           } as RawSourceMap)
         : null,
   };

   return result;
}

/**
 * Convert a resource asset to a CommonJS module.
 */
async function resourceToCJSModule(
   bundler: Toypack,
   source: string,
   content: Blob
) {
   let exportStr = "";

   const mode = bundler.options.bundleOptions.mode;

   if (mode == "production") {
      /* let url = `data:${content.type};base64,`;
      url += btoa(await content.arrayBuffer());

      exportStr = url; */
      exportStr = path.join("resources", source);
   } else {
      exportStr = URL.createObjectURL(content);
      console.log(exportStr);

      // test: production
      // exportStr = path.join("resources", getUniqueIdFromString(source, shouldMinify) + path.extname(source));
   }

   let result = rt.moduleWrap(source, `module.exports = "${exportStr}";`);

   return result;
}

function offsetLines(incomingSourceMap: RawSourceMap, lineOffset: number) {
   var consumer = new SourceMapConsumer(incomingSourceMap);
   var generator = new SourceMapGenerator({
      file: incomingSourceMap.file,
      sourceRoot: incomingSourceMap.sourceRoot,
   });
   consumer.eachMapping(function (m) {
      // skip invalid (not-connected) mapping
      // refs: https://github.com/mozilla/source-map/blob/182f4459415de309667845af2b05716fcf9c59ad/lib/source-map-generator.js#L268-L275
      if (
         typeof m.originalLine === "number" &&
         0 < m.originalLine &&
         typeof m.originalColumn === "number" &&
         0 <= m.originalColumn &&
         m.source
      ) {
         generator.addMapping({
            source: m.source,
            name: m.name,
            original: { line: m.originalLine, column: m.originalColumn },
            generated: {
               line: m.generatedLine + lineOffset,
               column: m.generatedColumn,
            },
         });
      }
   });
   var outgoingSourceMap = JSON.parse(generator.toString()) as RawSourceMap;
   if (typeof incomingSourceMap.sourcesContent !== "undefined") {
      outgoingSourceMap.sourcesContent = incomingSourceMap.sourcesContent;
   }
   return outgoingSourceMap;
}

function getLineCount(str: string) {
   return str.split("\n").length;
}

/**
 * Get the script bundle from graph.
 */
async function bundleScript(bundler: Toypack, graph: IDependency[]) {
   const bundleContent = new MagicString.Bundle();
   const bundleSourceMap = new SourceMapGenerator();

   const shouldMinify =
      bundler.options.bundleOptions.minified ||
      bundler.options.bundleOptions.mode == "production";

   const addBabelASTToBundle = (
      source: string,
      AST: Node,
      depMap: IDependencyMap,
      isEntry = false
   ) => {
      let { code, map } = transpileAST(bundler, source, AST, depMap);

      const wrappedMSTR = rt.moduleWrap(source, code, isEntry);

      bundleContent.addSource({
         filename: source,
         content: wrappedMSTR,
      });

      return { map, mstr: wrappedMSTR };
   };

   const addMapToBundle = (
      map: RawSourceMap,
      source: string,
      originalContent: string,
      generatedContent: string
   ) => {
      const currentBundleResult = bundleContent.toString();

      const contentIndex = currentBundleResult.indexOf(generatedContent);
      const lineInfo = lineColumn(currentBundleResult).fromIndex(contentIndex);
      if (!lineInfo) {
         throw new Error("Mapping failed.");
      }
      const moduleLineGap = 2;

      bundleSourceMap.setSourceContent(source, originalContent);
      const smc = new SourceMapConsumer(map);

      /**
       * Bundle is indented 2 times.
       * 1st indent is when `rt.moduleWrap` is used.
       * 2nd indent is the whole bundle's function wrap (see below).
       * TODO: add test on this
       */
      const bundleIndentCount = 2;
      const bundleIndentSize = rt.indentPrefix().length * bundleIndentCount;

      smc.eachMapping((map) => {
         bundleSourceMap.addMapping({
            source: source,
            original: {
               line: map.originalLine,
               column: map.originalColumn,
            },
            generated: {
               line: map.generatedLine + lineInfo!.line + moduleLineGap,
               column: map.generatedColumn + bundleIndentSize,
            },
            name: map.name,
         });
      });
   };

   /* Modules */
   for (let i = graph.length - 1; i >= 0; i--) {
      const dep = graph[i];

      if (dep.type == "style" && !dep.chunks) continue;

      if (dep.type != "resource" && dep.chunks && !dep.AST) {
         /**
          * Add chunks to the bundle if it's a script or style
          * dependency without an AST.
          */
         for (const chunk of dep.chunks) {
            // Extract script chunks from the dependency
            if (chunk.type == "script") {
               const { map, mstr } = addBabelASTToBundle(
                  chunk.source,
                  chunk.AST,
                  dep.dependencyMap
               );

               // Source map
               if (map) {
                  addMapToBundle(map, dep.source, dep.content, mstr.toString());
               }
            }
         }
      } else if (dep.type == "script" && dep.AST && !dep.chunks?.length) {
         /**
          * If it's a script dependency that has an AST and no
          * chunks, add the dependency itself to the bundle.
          */
         const { map, mstr } = addBabelASTToBundle(
            dep.source,
            dep.AST,
            dep.dependencyMap,
            i == 0
         );

         // Source map
         if (map) {
            addMapToBundle(map, dep.source, dep.content, mstr.toString());
         }
      } else if (dep.type == "resource") {
         /**
          * If it's a resource, compile first, then add to the bundle.
          */
         const compiled = await resourceToCJSModule(
            bundler,
            dep.source,
            dep.content
         );
         bundleContent.addSource({
            filename: dep.source,
            content: compiled,
         });
      } else {
         throw new Error(`Failed to compile '${dep.source}'.`);
      }
   }

   /* Main */
   /* code body */
   const requireFunction = rt.requireFunction();
   bundleContent.prepend(requireFunction);

   /* code wrap */
   bundleContent.indent(rt.indentPrefix());
   const openingWrap = `(function () {\n`;
   bundleContent.prepend(openingWrap);
   bundleContent.append(`\n})();`);

   const wrapOffset =
      getLineCount(requireFunction.trim()) + getLineCount(openingWrap.trim());

   const finalizedMap = MapConverter.fromObject(
      offsetLines(
         MapConverter.fromJSON(bundleSourceMap.toString()).toObject(),
         wrapOffset
      )
   );

   return bundleContent.toString() + `\n\n${finalizedMap.toComment()}`;
}

function compileCSS(source: string, AST: Root) {
   const result = {
      code: "",
      map: {},
   };

   if (!AST) {
      return result;
   }

   const compiled = postcss([]).process(AST, {
      from: source,
   });

   result.code = compiled.css;
   result.map = compiled.map;

   console.log(compiled);

   return result;
}

async function bundleStyle(bundler: Toypack, graph: IDependency[]) {
   const result = new MagicString.Bundle();

   const shouldMinify =
      bundler.options.bundleOptions.minified ||
      bundler.options.bundleOptions.mode == "production";

   const addPostCSSASTToBundle = (source: string, AST: Root) => {
      const { code, map } = compileCSS(source, AST);

      const magicStr = new MagicString.default(code);
      result.addSource({
         filename: source,
         content: magicStr,
      });

      /* filename comment */
      magicStr.prepend(`\n/* ${source.replace(/^\//, "")} */`);
   };

   /* Modules */
   for (let i = 0; i < graph.length; i++) {
      const dep = graph[i];

      if (dep.type == "script" && !dep.chunks) continue;

      if (dep.type != "resource" && dep.chunks && !dep.AST) {
         /**
          * Add chunks to the bundle if it's a script or style
          * dependency without an AST.
          */
         for (const chunk of dep.chunks) {
            // Extract style chunks from the dependency
            if (chunk.type == "style") {
               addPostCSSASTToBundle(chunk.source, chunk.AST);
               console.log(chunk);
            }
         }
      } else if (dep.type == "style" && dep.AST && !dep.chunks?.length) {
         /**
          * If it's a style dependency that has an AST and no
          * chunks, add the dependency itself to the bundle.
          */
         addPostCSSASTToBundle(dep.source, dep.AST);
      } else if (dep.type == "resource") {
         /**
          * If it's a resource, compile first, then add to the bundle.
          */
         /* const compiled = await resourceToCJSModule(
            bundler,
            dep.source,
            dep.content,
            shouldMinify
         );
         result.addSource({
            filename: dep.source,
            content: compiled,
         }); */
      } else {
         throw new Error(`Failed to compile '${dep.source}'.`);
      }
   }

   return result.toString();
}

export async function bundle(bundler: Toypack, graph: IDependency[]) {
   return {
      script: await bundleScript(bundler, graph),
      style: await bundleStyle(bundler, graph),
   };
}
