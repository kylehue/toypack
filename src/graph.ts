import { parse as getASTFromJS, ParserOptions } from "@babel/parser";
import traverseAST, { Node } from "@babel/traverse";
import * as CSSTree from "css-tree";
import path from "path-browserify";
import { RawSourceMap } from "source-map-js";
import { Asset } from "./asset.js";
import {
   assetNotFoundError,
   assetStrictlyHTMLorJSError,
   entryPointNotFoundError,
   loaderNotFoundError,
   parseError,
   resolveFailureError,
} from "./errors.js";
import { Toypack } from "./Toypack.js";
import { getUniqueIdFromString, isCSS, isJS, parseURLQuery } from "./utils.js";

export interface IChunk {
   source: string;
   content: string | Blob;
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
}

export interface IScriptDependency extends ISimpleDependency {
   type: "script";
   AST?: Node;
   chunks?: {
      type: "script";
      AST: Node;
      source: string;
      content: string;
      map?: RawSourceMap;
   }[];
}

export interface IStyleDependency extends ISimpleDependency {
   type: "style";
   AST?: CSSTree.CssNode;
   chunks?: {
      type: "style";
      AST: CSSTree.CssNode;
      source: string;
      content: string;
      map?: RawSourceMap;
   }[];
}

export interface IResourceDependency {
   type: "resource";
   source: string;
   content: Blob;
}

export type IDependency =
   | IScriptDependency
   | IStyleDependency
   | IResourceDependency;

export interface IDependencyMapSource {
   relative: string;
   absolute: string;
}

export type IDependencyMap = Record<string, IDependencyMapSource>;

export type IScanCallback = (dep: {
   mapSource: IDependencyMapSource;
   asset: Asset;
   AST: Node | CSSTree.CssNode;
   params: IModuleOptions;
}) => void;

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
      sourceFilename: source
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
      AST: {} as CSSTree.CssNode,
   };

   const AST = CSSTree.parse(content, {
      positions: !!bundler.options.bundleOptions.sourceMap,
      filename: source,
      onParseError(error: any) {
         let message = error.formattedMessage;
         if (!message) {
            message = `${error.name}: ${error.message}`;

            if (error.line && error.column) {
               message += ` at line ${error.line}, column ${error.column}`;
            }
         }

         message += `\n\nSource file: ${source}`;

         bundler.hooks.trigger("onError", parseError(message));
      },
   });

   result.AST = AST;

   CSSTree.walk(AST, function (node, item, list) {
      // property: url(...);
      if (this.declaration && node.type === "Url") {
         const sourceValue = "/" + node.value.replace(/^\//, "");
         let isValidDep = true;
         // Scroll-to-element-id urls are not a dependency
         if (isValidDep && sourceValue.startsWith("#")) isValidDep = false;
         // No need to add data urls to dependencies
         if (isValidDep && sourceValue.startsWith("data:")) isValidDep = false;
         // url()'s source path can't be .js or .css.
         if (
            isValidDep &&
            !bundler.extensions.resource.includes(path.extname(sourceValue))
         ) {
            bundler.hooks.trigger(
               "onError",
               parseError(
                  `'url()' tokens can't be used to reference ${path.extname(
                     sourceValue
                  )} files. '${sourceValue}' is not a valid resource file.`
               )
            );

            isValidDep = false;
         }

         if (isValidDep) {
            // Change source path based on bundle mode
            const resolved = bundler.resolve(sourceValue, {
               baseDir: path.dirname(source),
            });
            
            if (resolved) {
               if (bundler.options.bundleOptions.mode == "production") {
                  node.value =
                     getUniqueIdFromString(resolved) + path.extname(resolved);
               } else {
                  const resolvedAsset = bundler.getAsset(resolved);

                  if (resolvedAsset && resolvedAsset.contentURL) {
                     node.value = resolvedAsset.contentURL;
                  }
               }
            }

            // Add
            result.dependencies.push(sourceValue);
         }
      }

      if (node.type === "Atrule" && node.name == "import") {
         // @import "...";
         const atImportValueNode = CSSTree.find(
            node,
            (child) => child.type === "String"
         );

         if (
            atImportValueNode &&
            atImportValueNode.type == "String" &&
            atImportValueNode.value
         ) {
            result.dependencies.push(path.join("/", atImportValueNode.value));
            list.remove(item);
         }

         // @import url("...");
         const atImportURLValueNode = CSSTree.find(
            node,
            (child) => child.type === "Url"
         );

         if (
            atImportURLValueNode &&
            atImportURLValueNode.type == "Url" &&
            atImportURLValueNode.value
         ) {
            result.dependencies.push(
               path.join("/", atImportURLValueNode.value)
            );
            list.remove(item);
         }
      }
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
   const result = [] as (IChunk & { map?: RawSourceMap })[];

   const recursiveCompile = (source: string, content: string | Blob) => {
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
            source: source,
            content: compilation.content,
            map: compilation.map,
         });
      } else {
         for (const [lang, dataArr] of Object.entries(compilation.use)) {
            const chunkSource = `${chunk.source}.chunk-${result.length}.${lang}`;
            for (const data of dataArr) {
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
   if (typeof chunk.content != "string") {
      throw new Error(
         `Failed to scan '${chunk.source}'. The chunk's content has to be a type of string in order to be scanned for dependencies.`
      );
   }

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
   // Avoid dependency duplication in the graph
   if (graph.some((dep) => dep.source == entryChunk.source)) {
      return graph;
   }

   // No need to parse a resource dependency
   if (typeof entryChunk.content != "string") {
      graph.push({
         type: "resource",
         content: entryChunk.content,
         source: entryChunk.source,
      } as IResourceDependency);

      return graph;
   }

   const parentDep: IScriptDependency | IStyleDependency = {
      type: isScriptDep(bundler, entryChunk.source) ? "script" : "style",
      source: entryChunk.source,
      content: entryChunk.content,
      dependencyMap: {},
   };

   graph.push(parentDep);

   const isSupported = isJS(entryChunk.source) || isCSS(entryChunk.source);

   const scanDeps: IScanCallback = (dep) => {
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
      for (const chunk of compileAndGetChunks(bundler, parentDep, params)) {
         const parsed = scanChunkDeps(bundler, chunk, scanDeps);

         parentDep.chunks.push({
            type: isScriptDep(bundler, chunk.source) ? "script" : "style",
            AST: parsed.AST,
            content: chunk.content,
            source: chunk.source,
            map: chunk.map,
         } as any);
      }
   }

   return graph;
}

/**
 * Checks if source is a type of script dependency.
 */
function isScriptDep(bundler: Toypack, source: string) {
   const depExtension = path.extname(source);
   return bundler.extensions.script.includes(depExtension);
}

/**
 * Get the dependency graph of the bundler starting from the entry point.
 */
export function getDependencyGraph(bundler: Toypack) {
   const entrySource = bundler.options.bundleOptions.entry
      ? bundler.resolve(path.join("/", bundler.options.bundleOptions.entry))
      : bundler.resolve("/");

   let result: IDependency[] = [];

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

   result = graph;

   /* for (let dep of graph) {
      if (isScriptDep(bundler, dep.source)) {
         result.script.push(dep as IScriptDependency);
      } else {
         result.style.push(dep as IStyleDependency);
      }
   } */

   return result;
}
