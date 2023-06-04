import { parse as getASTFromJS, ParserOptions } from "@babel/parser";
import { Root, parse as getASTFromCSS } from "postcss";
import parseCSSValue from "postcss-value-parser";
import traverseAST, { TraverseOptions, Node } from "@babel/traverse";
import path from "path-browserify";
import { Asset } from "./asset.js";
import {
   assetNotFoundError,
   assetStrictlyHTMLorJSError,
   entryPointNotFoundError,
   loaderNotFoundError,
   resolveFailureError,
} from "./errors.js";
import { Toypack } from "./Toypack.js";
import { isCSS, isJS, parseURLQuery } from "./utils.js";

export interface IChunk {
   source: string;
   content: string;
}

export interface IModuleOptions {
   /** When enabled, module will be loaded as a literal string. */
   raw?: boolean;
   [key: string]: any;
}

interface ISimpleDependency {
   source: string;
   content: string;
   dependencyMap: IDependencyMap;
   chunks?: {
      AST: Node | Root;
      source: string;
      content: string;
   }[];
}

export interface IScriptDependency extends ISimpleDependency {
   type: "script";
   AST?: Node;
}

export interface IStyleDependency extends ISimpleDependency {
   type: "style";
   AST?: Root;
}

export type IDependency = IScriptDependency | IStyleDependency;

export interface IDependencyMapSource {
   relative: string;
   absolute: string;
}

export type IDependencyMap = Record<string, IDependencyMapSource>;

export type IScanCallback = (dep: {
   mapSource: IDependencyMapSource;
   asset: Asset;
   AST: Node | Root;
   params: IModuleOptions;
}) => void;

const CSSUrlFunctionRegex = /url\s*\("?(?![a-z]+:)/;

/**
 * Get dependencies and AST of a script module.
 */
function parseJSModule(bundler: Toypack, source: string, content: string) {
   const result = {
      dependencies: [] as string[],
      AST: {} as Node,
   };

   const format = bundler.options.bundleOptions.module;

   const userBabelOptions = bundler.options.babelOptions.parse;
   const importantBabelOptions: ParserOptions = {
      sourceType: format == "esm" ? "module" : "script",
      sourceFilename: source,
   };

   const AST = getASTFromJS(content, {
      ...userBabelOptions,
      ...importantBabelOptions,
   });

   result.AST = AST;

   if (format == "esm") {
      traverseAST(AST, {
         ImportDeclaration({ node }) {
            result.dependencies.push(node.source.value);
         },
         ExportAllDeclaration({ node }) {
            result.dependencies.push(node.source.value);
         },
         ExportNamedDeclaration({ node }) {
            if (node.source) {
               result.dependencies.push(node.source.value);
            }
         },
      });
   } else {
      traverseAST(AST, {
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
               result.dependencies.push(argNode.value);
            }
         },
      });
   }

   return result;
}

/**
 * Get dependencies and AST of a CSS module.
 */
function parseCSSModule(bundler: Toypack, source: string, content: string) {
   const result = {
      dependencies: [] as string[],
      AST: {} as Root,
   };

   const AST = getASTFromCSS(content);

   result.AST = AST;

   // Scan for `@import ""` or `@import url("")` dependencies
   AST.walkAtRules((atRuleNode) => {
      if (atRuleNode.name != "import") return;

      parseCSSValue(atRuleNode.params).walk((valueNode) => {
         // @import url("");
         if (
            valueNode.type == "function" &&
            valueNode.value == "url" &&
            valueNode.nodes.length
         ) {
            result.dependencies.push(valueNode.nodes[0].value);
            atRuleNode.remove();
         }

         // @import "";
         else if (valueNode.value.length) {
            result.dependencies.push(valueNode.value);
            atRuleNode.remove();
         }
      });
   });

   // Scan for `css-property: url("")` dependencies
   AST.walkDecls((declNode) => {
      if (!CSSUrlFunctionRegex.test(declNode.value)) return;
      parseCSSValue(declNode.value).walk((valueNode) => {
         if (
            valueNode.type != "function" ||
            valueNode.value != "url" ||
            !valueNode.nodes.length
         ) {
            return;
         }

         let source = valueNode.nodes[0].value;

         // scroll-to-element-id-urls are not a dependency
         if (source.startsWith("#")) return;
         // no need to add data urls to dependencies
         if (source.startsWith("data:")) return;

         result.dependencies.push(source);
      });
   });

   return result;
}

/**
 * Recursively compiles a chunk using loaders.
 *
 * Algorithm:
 *
 * `.vue -> [.scss, .ts] -> [.css, .js]`
 */
function compileAndGetChunks(
   bundler: Toypack,
   chunk: IChunk,
   options: IModuleOptions
) {
   const result: IChunk[] = [];

   const recursiveCompile = (source: string, content: string | ArrayBuffer) => {
      const loader = bundler.loaders.find((l) => l.test.test(source));

      if (!loader) {
         bundler.hooks.trigger("onError", loaderNotFoundError(source));
         return;
      }

      const compilation = loader.compile({
         source,
         content,
         options,
      });

      if (compilation.type == "result") {
         result.push({
            source,
            content: compilation.content,
         });
      } else {
         for (const [lang, dataArr] of Object.entries(compilation.use)) {
            for (const data of dataArr) {
               const chunkSource = `${chunk.source}.chunk-${result.length}.${lang}`;
               if (result.some((v) => v.source == chunkSource)) {
                  continue;
               }
               recursiveCompile(chunkSource, data.content);
            }
         }
      }
   };

   recursiveCompile(chunk.source, chunk.content);

   return result;
}

/**
 * Scan chunk for dependencies.
 */
function scanChunkDeps(
   bundler: Toypack,
   chunk: IChunk,
   callback: IScanCallback
) {
   const { source, content } = chunk;

   let parsed;
   if (bundler.extensions.script.includes(path.extname(source))) {
      parsed = {
         type: "script",
         ...parseJSModule(bundler, source, content),
      };
   } else if (bundler.extensions.style.includes(path.extname(source))) {
      parsed = {
         type: "style",
         ...parseCSSModule(bundler, source, content),
      };
   } else {
      throw new Error(
         "A chunk can only either be an script type or style type."
      );
   }

   for (const childDepRelativeSource of parsed.dependencies) {
      const childDepURLQuery = parseURLQuery(childDepRelativeSource);

      const childDepAbsoluteSource = bundler.resolve(childDepURLQuery.target, {
         baseDir: path.dirname(source),
      });

      const childDepAsset = childDepAbsoluteSource
         ? bundler.assets.get(childDepAbsoluteSource)
         : null;

      if (!childDepAsset) {
         bundler.hooks.trigger(
            "onError",
            resolveFailureError(childDepRelativeSource, source)
         );
         break;
      }

      callback({
         mapSource: {
            relative: childDepRelativeSource,
            absolute: childDepAsset.source,
         },
         asset: childDepAsset,
         AST: parsed.AST,
         params: childDepURLQuery.params,
      });
   }

   return parsed;
}

/**
 * Recursively gets the dependency graph of a chunk.
 */
function getGraphRecursive(
   bundler: Toypack,
   entryChunk: IChunk,
   params: IModuleOptions = {},
   graph: IDependency[] = []
) {
   const parentDep: IDependency = {
      type: isScriptDep(bundler, entryChunk.source) ? "script" : "style",
      source: entryChunk.source,
      content: entryChunk.content,
      dependencyMap: {},
   };

   // Avoid dependency duplication in the graph
   if (graph.some((dep) => dep.source == entryChunk.source)) {
      return graph;
   } else {
      graph.push(parentDep);
   }

   const isSupported = isJS(entryChunk.source) || isCSS(entryChunk.source);

   const scanDeps: IScanCallback = (dep) => {
      if (typeof dep.asset.content != "string") {
         return;
      }

      parentDep.dependencyMap[dep.mapSource.relative] = {
         relative: dep.mapSource.relative,
         absolute: dep.mapSource.absolute,
      };

      const childDepChunk: IChunk = {
         source: dep.asset.source,
         content: dep.asset.content,
      };

      getGraphRecursive(bundler, childDepChunk, dep.params, graph);
   };

   if (isSupported) {
      const parsed = scanChunkDeps(bundler, parentDep, scanDeps);
      parentDep.AST = parsed.AST;
   } else {
      parentDep.chunks = [];
      for (let chunk of compileAndGetChunks(bundler, parentDep, params)) {
         const parsed = scanChunkDeps(bundler, chunk, scanDeps);

         parentDep.chunks.push({
            AST: parsed.AST,
            content: chunk.content,
            source: chunk.source,
         });
      }
   }

   return graph;
}

/**
 * Checks if source is a type of script dependency.
 */
function isScriptDep(bundler: Toypack, source: string) {
   const depExtension = path.extname(source);
   return (
      bundler.extensions.script.includes(depExtension) ||
      bundler.extensions.resource.includes(depExtension)
   );
}

/**
 * Get the dependency graph of the bundler starting from the entry point.
 */
export function getDependencyGraph(bundler: Toypack) {
   const entrySource = bundler.options.bundleOptions.entry
      ? bundler.resolve(path.join("/", bundler.options.bundleOptions.entry))
      : bundler.resolve("/");

   let result = {
      script: [] as IScriptDependency[],
      style: [] as IStyleDependency[],
   };

   const entryAsset = entrySource ? bundler.assets.get(entrySource) : null;

   if (!entryAsset) {
      bundler.hooks.trigger("onError", entryPointNotFoundError());
      return result;
   }

   const supportedEntryExtensions = [
      ".js",
      ".mjs",
      ".cjs",
      ".ts",
      ".jsx",
      ".tsx",
      ".html",
   ];

   if (
      !supportedEntryExtensions.includes(
         path.extname(entryAsset.source).toLowerCase()
      )
   ) {
      bundler.hooks.trigger(
         "onError",
         assetStrictlyHTMLorJSError(entryAsset.source)
      );
      return result;
   }

   if (typeof entryAsset.content != "string") {
      throw new Error("Entry asset's content must be a string.");
   }

   const graph = getGraphRecursive(bundler, {
      source: entryAsset.source,
      content: entryAsset.content,
   });

   for (let dep of graph) {
      if (isScriptDep(bundler, dep.source)) {
         result.script.push(dep as IScriptDependency);
      } else {
         result.style.push(dep as IStyleDependency);
      }
   }

   return result;
}
