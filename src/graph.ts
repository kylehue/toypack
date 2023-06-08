import { parse as getASTFromJS, ParserOptions } from "@babel/parser";
import traverseAST, { Node } from "@babel/traverse";
import * as CSSTree from "css-tree";
import path from "path-browserify";
import { RawSourceMap } from "source-map-js";
import { Asset } from "./asset.js";
import {
   assetStrictlyHTMLorJSError,
   entryPointNotFoundError,
   loaderNotFoundError,
   parseError,
   resolveFailureError,
} from "./errors.js";
import { ICompileData, Toypack } from "./Toypack.js";
import { getHash, isCSS, isJS, parseURLQuery } from "./utils.js";

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
}) => Promise<void>;

const dummyNodeAST = getASTFromJS("");

export interface IParseJSResult {
   type: "script";
   dependencies: string[];
   AST: Node;
}

export interface IParseCSSResult {
   type: "style";
   dependencies: string[];
   AST: CSSTree.CssNode;
}

/**
 * Get dependencies and AST of a script module.
 */
export function parseJSModule(
   this: Toypack,
   source: string,
   content: string
): IParseJSResult {
   const cached = this.cachedDeps.parsed.get(source);
   if (cached && cached.type == "script") {
      const asset = this.getAsset(source);

      if (!asset?.modified) return cached;
   }

   const result: IParseJSResult = {
      type: "script",
      dependencies: [] as string[],
      AST: dummyNodeAST as Node,
   };

   const format = this.options.bundleOptions.module;
   const userBabelOptions = this.options.babelOptions.parse;
   const importantBabelOptions: ParserOptions = {
      sourceType: format == "esm" ? "module" : "script",
      sourceFilename: source,
   };

   let AST;

   try {
      AST = getASTFromJS(content, {
         ...userBabelOptions,
         ...importantBabelOptions,
      });
   } catch (error) {
      this.hooks.trigger("onError", parseError(error as any));

      return result;
   }

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

   this.cachedDeps.parsed.set(source, result);

   return result;
}

/**
 * Get dependencies and AST of a CSS module.
 */
function parseCSSModule(
   this: Toypack,
   source: string,
   content: string
): IParseCSSResult {
   const cached = this.cachedDeps.parsed.get(source);
   if (cached && cached.type == "style") {
      const asset = this.getAsset(source);

      if (!asset?.modified) return cached;
   }

   const result: IParseCSSResult = {
      type: "style",
      dependencies: [] as string[],
      AST: {} as CSSTree.CssNode,
   };

   const AST = CSSTree.parse(content, {
      positions: !!this.options.bundleOptions.sourceMap,
      filename: source,
      onParseError: (error: any) => {
         let message = error.formattedMessage;
         if (!message) {
            message = `${error.name}: ${error.message}`;

            if (error.line && error.column) {
               message += ` at line ${error.line}, column ${error.column}`;
            }
         }

         message += `\n\nSource file: ${source}`;

         this.hooks.trigger("onError", parseError(message));
      },
   });

   result.AST = AST;

   CSSTree.walk(AST, (node, item, list) => {
      // property: url(...);
      if (node.type === "Url") {
         const sourceValue = node.value;
         let isValidDep = true;
         // Scroll-to-element-id urls are not a dependency
         if (isValidDep && sourceValue.startsWith("#")) isValidDep = false;
         // No need to add data urls to dependencies
         if (isValidDep && sourceValue.startsWith("data:")) isValidDep = false;
         // url()'s source path can't be .js or .css.
         if (isValidDep && !this.hasExtension("resource", sourceValue)) {
            this.hooks.trigger(
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
            const resolved = this.resolve(
               "/" + sourceValue.replace(/^\//, ""),
               {
                  baseDir: path.dirname(source),
               }
            );

            if (resolved) {
               if (this.options.bundleOptions.mode == "production") {
                  node.value = getHash(resolved) + path.extname(resolved);
               } else {
                  const resolvedAsset = this.getAsset(resolved);

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

   this.cachedDeps.parsed.set(source, result);

   return result;
}

/**
 * Recursively compiles a chunk using loaders.
 *
 * Algorithm:
 *
 * `.vue -> [.scss, .ts] -> [.css, .js]`
 */
async function compileAndGetChunks(
   this: Toypack,
   chunk: IChunk,
   options: IModuleOptions
) {
   const result = [] as (IChunk & { map?: RawSourceMap })[];

   const recursiveCompile = async (source: string, content: string | Blob) => {
      const loader = this.loaders.find((l) => l.test.test(source));

      if (!loader) {
         await this.hooks.trigger("onError", loaderNotFoundError(source));
         return;
      }

      let compilation;
      const compilationData: ICompileData = {
         source,
         content,
         options,
      };

      if (loader.async) {
         compilation = await loader.compile(compilationData);
      } else {
         compilation = loader.compile(compilationData);
      }

      if (compilation.type == "result") {
         result.push({
            source: source,
            content: compilation.content,
            map: compilation.map,
         });
      } else {
         for (const [lang, dataArr] of Object.entries(compilation.use)) {
            const chunkSource = `${chunk.source}.chunk-${getHash(
               chunk.source
            )}-${result.length}.${lang}`;
            for (const data of dataArr) {
               if (result.some((v) => v.source == chunkSource)) {
                  continue;
               }
               await recursiveCompile(chunkSource, data.content);
            }
         }
      }
   };

   await recursiveCompile(chunk.source, chunk.content);

   return result;
}

/**
 * Scan chunk for dependencies.
 */
async function scanChunkDeps(
   this: Toypack,
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
   if (this.hasExtension("script", source)) {
      // Check cache
      parsed = parseJSModule.call(this, source, content);
   } else if (this.hasExtension("style", source)) {
      parsed = parseCSSModule.call(this, source, content);
   } else {
      throw new Error(
         "A chunk can only either be an script type or style type."
      );
   }

   for (const childDepRelativeSource of parsed.dependencies) {
      const childDepURLQuery = parseURLQuery(childDepRelativeSource);

      const childDepAbsoluteSource = this.resolve(childDepURLQuery.target, {
         baseDir: path.dirname(source),
      });

      const childDepAsset = childDepAbsoluteSource
         ? this.assets.get(childDepAbsoluteSource)
         : null;

      if (!childDepAsset) {
         await this.hooks.trigger(
            "onError",
            resolveFailureError(childDepRelativeSource, source)
         );
         break;
      }

      await callback({
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
async function getGraphRecursive(
   this: Toypack,
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
      });
      return graph;
   }

   const parentDep: IScriptDependency | IStyleDependency = {
      type: this.hasExtension("script", entryChunk.source) ? "script" : "style",
      source: entryChunk.source,
      content: entryChunk.content,
      dependencyMap: {},
   };

   graph.push(parentDep);

   const isSupported = isJS(entryChunk.source) || isCSS(entryChunk.source);

   const scanDeps: IScanCallback = async (dep) => {
      parentDep.dependencyMap[dep.mapSource.relative] = {
         relative: dep.mapSource.relative,
         absolute: dep.mapSource.absolute,
      };

      const childDepChunk: IChunk = {
         source: dep.asset.source,
         content: dep.asset.content,
      };

      await getGraphRecursive.call(this, childDepChunk, dep.params, graph);
   };

   if (isSupported) {
      const parsed = await scanChunkDeps.call(this, parentDep, scanDeps);
      parentDep.AST = parsed.AST;
   } else {
      parentDep.chunks = [];
      for (const chunk of await compileAndGetChunks.call(
         this,
         parentDep,
         params
      )) {
         const parsed = await scanChunkDeps.call(this, chunk, scanDeps);

         parentDep.chunks.push({
            type: this.hasExtension("script", chunk.source)
               ? "script"
               : "style",
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
 * Get the dependency graph of the bundler starting from the entry point.
 */
export async function getDependencyGraph(this: Toypack) {
   const entrySource = this.options.bundleOptions.entry
      ? this.resolve(path.join("/", this.options.bundleOptions.entry))
      : this.resolve("/");

   let result: IDependency[] = [];

   const entryAsset = entrySource ? this.assets.get(entrySource) : null;

   if (!entryAsset) {
      await this.hooks.trigger("onError", entryPointNotFoundError());
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
      await this.hooks.trigger(
         "onError",
         assetStrictlyHTMLorJSError(entryAsset.source)
      );
      return result;
   }

   if (typeof entryAsset.content != "string") {
      throw new Error("Entry asset's content must be a string.");
   }

   const graph = await getGraphRecursive.call(this, {
      source: entryAsset.source,
      content: entryAsset.content,
   });

   result = graph;

   return result;
}
