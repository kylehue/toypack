import { TransformOptions, BabelFileResult } from "@babel/core";
import {
   transformFromAst,
   availablePlugins,
   availablePresets,
} from "@babel/standalone";
import traverseAST, { TraverseOptions, Node, NodePath } from "@babel/traverse";
import { IDependency, IDependencyMap } from "./graph.js";
import * as rt from "./runtime.js";
import { Toypack } from "./Toypack.js";
import { findCodePosition, getUniqueIdFromString } from "./utils.js";
import path from "path-browserify";
import {
   SourceMapConsumer,
   SourceMapGenerator,
   RawSourceMap,
} from "source-map-js";
import MapConverter from "convert-source-map";
import babelMinify from "babel-minify";
import { CodeComposer } from "./CodeComposer.js";
import * as CSSTree from "css-tree";
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
   depMap: IDependencyMap,
   inputSourceMap?: RawSourceMap
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
      sourceMaps: !!bundler.options.bundleOptions.sourceMap,
      envName: bundler.options.bundleOptions.mode,
      minified: bundler.options.bundleOptions.minified,
      comments: bundler.options.bundleOptions.minified,
      inputSourceMap: inputSourceMap,
   } as TransformOptions;

   const transpiled = transformFromAst(AST, undefined, {
      ...userBabelOptions,
      ...importantBabelOptions,
   }) as any as BabelFileResult;

   const result = {
      code: transpiled.code || "",
      map: MapConverter.fromObject(transpiled.map).toObject() as RawSourceMap,
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

/**
 * Merge a source map to the bundle.
 */
function mergeMapToBundle(
   bundler: Toypack,
   targetMap: SourceMapGenerator,
   sourceMap: RawSourceMap,
   source: string,
   originalContent: string,
   generatedContent: string,
   bundleContent: string
) {
   if (!targetMap) return;
   const position = findCodePosition(bundleContent, generatedContent);

   if (position.line == -1) {
      if (
         bundler.options.logLevel == "error" ||
         bundler.options.logLevel == "warn"
      ) {
         console.warn(
            `Warning: Source map discrepancy for '${source}'. The mappings may be inaccurate because the generated code's position could not be found in the bundle code.`
         );
      }
   }

   const sourceMapOption = bundler.options.bundleOptions.sourceMap;
   if (sourceMapOption != "nosources") {
      targetMap.setSourceContent(source, originalContent);
   }

   const smc = new SourceMapConsumer(sourceMap);
   smc.eachMapping((map) => {
      targetMap.addMapping({
         source: source,
         original: {
            line: map.originalLine || 1,
            column: map.originalColumn || 0,
         },
         generated: {
            line: map.generatedLine + position.line,
            column: map.generatedColumn + position.column,
         },
         name: map.name,
      });
   });
}

/**
 * Get the script bundle from graph.
 */
async function bundleScript(bundler: Toypack, graph: IDependency[]) {
   const bundleContent = new CodeComposer(undefined, {
      indentSize: 4,
   });
   const sourceMapOption = bundler.options.bundleOptions.sourceMap;
   const bundleSourceMap = !!sourceMapOption ? new SourceMapGenerator() : null;

   /**
    * Add a Babel AST to the bundle.
    */
   const addBabelASTToBundle = (
      source: string,
      AST: Node,
      depMap: IDependencyMap,
      inputSourceMap?: RawSourceMap
   ) => {
      let { code, map } = transpileAST(
         bundler,
         source,
         AST,
         depMap,
         inputSourceMap
      );

      const wrappedModule = rt.moduleWrap(
         source,
         code,
         source === graph[0].source
      );

      bundleContent.append(wrappedModule).breakLine();

      return { map, code };
   };

   /**
    * Finalizes and stringifies the bundle content. It adds the
    * `require` function to the code and wraps the code in IIFE.
    */
   const finalizeBundleContent = () => {
      const bundleClone = bundleContent.clone();
      bundleClone.prepend(rt.requireFunction());
      bundleClone.wrap(`
      (function () {
         <CODE_BODY>
      })();
      `);

      return bundleClone.toString();
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
               const { map, code } = addBabelASTToBundle(
                  chunk.source,
                  chunk.AST,
                  dep.dependencyMap,
                  chunk.map
               );

               // Source map
               if (bundleSourceMap && map) {
                  mergeMapToBundle(
                     bundler,
                     bundleSourceMap,
                     map,
                     dep.source,
                     dep.content,
                     code,
                     finalizeBundleContent()
                  );
               }
            }
         }
      } else if (dep.type == "script" && dep.AST && !dep.chunks?.length) {
         /**
          * If it's a script dependency that has an AST and no
          * chunks, add the dependency itself to the bundle.
          */
         const { map, code } = addBabelASTToBundle(
            dep.source,
            dep.AST,
            dep.dependencyMap
         );

         // Source map
         if (bundleSourceMap && map) {
            mergeMapToBundle(
               bundler,
               bundleSourceMap,
               map,
               dep.source,
               dep.content,
               code,
               finalizeBundleContent()
            );
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

         bundleContent.append(compiled).breakLine();
      } else {
         throw new Error(`Failed to compile '${dep.source}'.`);
      }
   }

   /* Finishing */
   const finalizedMap = bundleSourceMap
      ? MapConverter.fromJSON(bundleSourceMap.toString())
      : null;

   const result = {
      code: finalizeBundleContent(),
      map: finalizedMap,
   };

   const shouldMinify =
      bundler.options.bundleOptions.minified ||
      bundler.options.bundleOptions.mode == "production";

   if (shouldMinify) {
      const { code, map } = babelMinify(
         result.code,
         {},
         {
            inputSourceMap: result.map?.toObject(),
            sourceMaps: true,
            comments: false,
         }
      );

      result.code = code;
      result.map = MapConverter.fromObject(map);
   }

   return result;
}

interface CSSTreeGeneratedResult {
   css: string;
   map: SourceMapGenerator;
}

function compileCSS(
   bundler: Toypack,
   AST: CSSTree.CssNode,
   inputSourceMap?: RawSourceMap
) {
   const sourceMapOption = bundler.options.bundleOptions.sourceMap;

   const compiled = CSSTree.generate(AST, {
      sourceMap: !!sourceMapOption,
   }) as any as CSSTreeGeneratedResult;

   const result = {
      code: compiled.css,
      map: MapConverter.fromJSON(
         compiled.map.toString()
      ).toObject() as RawSourceMap,
   };

   // TODO: merge input source map from the source map result

   return result;
}

async function bundleStyle(bundler: Toypack, graph: IDependency[]) {
   const bundleContent = new CodeComposer(undefined, {
      indentSize: 4,
   });
   const sourceMapOption = bundler.options.bundleOptions.sourceMap;
   const bundleSourceMap = !!sourceMapOption ? new SourceMapGenerator() : null;

   console.log(graph);

   const addPostCSSASTToBundle = (
      source: string,
      AST: CSSTree.CssNode,
      inputSourceMap?: RawSourceMap
   ) => {
      const { code, map } = compileCSS(bundler, AST, inputSourceMap);

      bundleContent.append(`/* ${source.replace(/^\//, "")} */`);
      bundleContent.append(code).breakLine();

      return { code, map };
   };

   const finalizeBundleContent = () => {
      return bundleContent.toString();
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
               const { code, map } = addPostCSSASTToBundle(
                  chunk.source,
                  chunk.AST
               );

               if (bundleSourceMap && map) {
                  map.sourcesContent = [dep.content];
                  mergeMapToBundle(
                     bundler,
                     bundleSourceMap,
                     map,
                     dep.source,
                     dep.content,
                     code,
                     finalizeBundleContent()
                  );
               }
            }
         }
      } else if (dep.type == "style" && dep.AST && !dep.chunks?.length) {
         /**
          * If it's a style dependency that has an AST and no
          * chunks, add the dependency itself to the bundle.
          */
         const { code, map } = addPostCSSASTToBundle(dep.source, dep.AST);

         if (bundleSourceMap && map) {
            map.sourcesContent = [dep.content];
            mergeMapToBundle(
               bundler,
               bundleSourceMap,
               map,
               dep.source,
               dep.content,
               code,
               finalizeBundleContent()
            );
         }
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

   /* Finishing */
   const finalizedMap = bundleSourceMap
      ? MapConverter.fromJSON(bundleSourceMap.toString())
      : null;

   const result = {
      code: finalizeBundleContent(),
      map: finalizedMap,
   };

   return result;
}

export async function bundle(bundler: Toypack, graph: IDependency[]) {
   const result = {
      resources: [] as Blob[],
      script: "",
      style: "",
   };

   const mode = bundler.options.bundleOptions.mode;
   const style = await bundleStyle(bundler, graph);
   const script = await bundleScript(bundler, graph);

   result.script = script.code;
   result.style = style.code;

   //console.log(result.script);

   // Inline everything if in development mode
   if (mode == "development") {
      if (script.map) {
         result.script += `\n\n${script.map.toComment()}`;
      }
      if (style.map) {
         result.style += `\n${style.map.toComment({ multiline: true })}`;
      }
   } else {
   }

   return result;
}
