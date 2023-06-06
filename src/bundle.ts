import { TransformOptions, BabelFileResult } from "@babel/core";
import {
   transformFromAst,
   availablePlugins,
   availablePresets,
} from "@babel/standalone";
import traverseAST, { TraverseOptions, Node, NodePath } from "@babel/traverse";
import postcss, { Root, parse } from "postcss";
import * as MagicString from "magic-string";
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
import autoprefixer from "autoprefixer";
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

/**
 * Get the script bundle from graph.
 */
async function bundleScript(bundler: Toypack, graph: IDependency[]) {
   const bundleContent = new CodeComposer("");
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

      bundleContent.append(wrappedModule.trim() + "\n");

      return { map, code };
   };

   /**
    * Finalizes and stringifies the bundle content. It adds the
    * `require` function to the code and wraps the code in IIFE.
    */
   const finalizeBundleContent = () => {
      const bundleClone = bundleContent.clone();
      bundleClone.prepend(rt.requireFunction());
      bundleClone.indent(rt.indentPrefix());
      bundleClone.wrap(`
      (function () {
         <CODE_BODY>
      })();
      `);

      return bundleClone.toString();
   };

   /**
    * Add a source map to the bundle.
    */
   const addMapToBundle = (
      map: RawSourceMap,
      source: string,
      originalContent: string,
      generatedContent: string
   ) => {
      if (!bundleSourceMap) return;

      const currentBundleResult = finalizeBundleContent();
      const position = findCodePosition(currentBundleResult, generatedContent);

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

      if (sourceMapOption != "nosources") {
         bundleSourceMap.setSourceContent(source, originalContent);
      }

      const smc = new SourceMapConsumer(map);
      smc.eachMapping((map) => {
         bundleSourceMap.addMapping({
            source: source,
            original: {
               line: map.originalLine,
               column: map.originalColumn,
            },
            generated: {
               line: map.generatedLine + position.line,
               column: map.generatedColumn + position.column,
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
               const { map, code } = addBabelASTToBundle(
                  chunk.source,
                  chunk.AST,
                  dep.dependencyMap,
                  chunk.map
               );

               // Source map
               if (bundleSourceMap && map) {
                  addMapToBundle(map, dep.source, dep.content, code);
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
            addMapToBundle(map, dep.source, dep.content, code);
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

         bundleContent.append(compiled + "\n");
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

function compileCSS(source: string, AST: Root, inputSourceMap?: RawSourceMap) {
   const result = {
      code: "",
      map: {},
   };

   if (!AST) {
      return result;
   }

   const compiled = postcss([autoprefixer()]).process(
      `.example {
    display: grid;
    transition: all .5s;
    user-select: none;
    background: linear-gradient(to bottom, white, black);
}
`,
      {
         from: source,
         to: source,
         map: true,
      }
   );

   result.code = compiled.css;
   result.map = compiled.map;

   console.log(compiled);

   return result;
}

async function bundleStyle(bundler: Toypack, graph: IDependency[]) {
   const result = new MagicString.Bundle();
   const bundleSourceMap = new SourceMapGenerator();

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

   const shouldMinify =
      bundler.options.bundleOptions.minified ||
      bundler.options.bundleOptions.mode == "production";
   return result.toString();
}

export async function bundle(bundler: Toypack, graph: IDependency[]) {
   const result = {
      resources: [] as Blob[],
      script: "",
      style: "",
   };

   const mode = bundler.options.bundleOptions.mode;
   const script = await bundleScript(bundler, graph);
   const style = await bundleStyle(bundler, graph);

   result.script = script.code;
   
   // Inline everything if in development mode
   if (mode == "development") {
      if (script.map) {
         result.script += `\n\n${script.map.toComment()}`;
      }
      //result.style = style.;
   } else {

   }

   return {
      script: result.script,
      style: await bundleStyle(bundler, graph),
   };
}
