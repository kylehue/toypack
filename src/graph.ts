import { parse as getAST, ParserOptions } from "@babel/parser";
import traverseAST, { TraverseOptions, Node } from "@babel/traverse";
import path from "path-browserify";
import { Asset } from "./asset.js";
import {
   assetNotFoundError,
   assetStrictlyHTMLorJSError,
   entryPointNotFoundError,
   resolveFailureError,
} from "./errors.js";
import { Toypack } from "./Toypack.js";
import { isJS, parseURLQuery } from "./utils.js";

export interface IResourceDependency {
   type: "resource";
   source: string;
   content: ArrayBuffer;
   params: IModuleOptions;
}

export interface IApplicationDependency {
   type: "application";
   source: string;
   content: string;
   params: IModuleOptions;
   AST: Node;
   dependencyMap: Record<string, { relative: string; absolute: string }>;
}

export type IDependency = IResourceDependency | IApplicationDependency;

function parseModule(bundler: Toypack, source: string, content: string) {
   const result = {
      source,
      content,
      dependencies: [] as string[],
      AST: {} as Node,
   };

   const format = bundler.options.bundleOptions.module;

   const userBabelOptions = bundler.options.babelOptions.parse;
   const importantBabelOptions: ParserOptions = {
      sourceType: format == "esm" ? "module" : "script",
      sourceFilename: source,
   };

   const AST = getAST(content, {
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

export interface IModuleOptions {
   /** When enabled, module will be loaded as a literal string. */
   raw?: boolean;
   [key: string]: any;
}

function getGraphRecursive(
   bundler: Toypack,
   entry: string,
   params: IModuleOptions = {},
   graph: IDependency[] = []
) {
   const asset = bundler.assets.get(path.join("/", entry));
   if (!asset) {
      bundler.hooks.trigger("onError", assetNotFoundError(entry));
      return graph;
   }

   // We don't need to scan non-text assets for dependencies
   if (typeof asset.content != "string") {
      graph.push({
         type: "resource",
         source: asset.source,
         content: asset.content,
         params,
      });

      return graph;
   }

   // Avoid asset duplication in the graph
   if (graph.some((dep) => dep.source == asset.source)) {
      return graph;
   }

   // Get chunks of an asset
   const chunks: { source: string; content: string }[] = [];
   if (isJS(asset.source)) {
      chunks.push({ source: asset.source, content: asset.content });
   } else {
      chunks.push(...asset.compile(params));
   }

   // Scan
   for (const chunk of chunks) {
      const parsed = parseModule(bundler, chunk.source, chunk.content);

      const parentDep: IDependency = {
         type: "application",
         source: chunk.source,
         content: chunk.content,
         params,
         AST: parsed.AST,
         dependencyMap: {},
      };

      graph.push(parentDep);

      for (const childDepRelativeSource of parsed.dependencies) {
         if (params.raw) {
            break;
         }

         const childDepURLQuery = parseURLQuery(childDepRelativeSource);

         bundler.hooks.trigger("onBeforeResolve", {
            parent: asset,
            source: childDepRelativeSource,
         });

         const childDepAbsoluteSource = bundler.resolve(
            childDepURLQuery.target,
            {
               baseDir: path.dirname(asset.source),
            }
         );

         if (!childDepAbsoluteSource) {
            bundler.hooks.trigger(
               "onError",
               resolveFailureError(childDepRelativeSource, asset.source)
            );
            break;
         }

         bundler.hooks.trigger("onAfterResolve", {
            parent: asset,
            source: {
               relative: childDepRelativeSource,
               absolute: childDepAbsoluteSource,
            },
         });

         parentDep.dependencyMap[childDepRelativeSource] = {
            relative: childDepRelativeSource,
            absolute: childDepAbsoluteSource,
         };

         getGraphRecursive(
            bundler,
            childDepAbsoluteSource,
            childDepURLQuery.params,
            graph
         );
      }
   }

   return graph;
}

export function getDependencyGraph(bundler: Toypack) {
   const entrySource = bundler.options.bundleOptions.entry
      ? bundler.resolve(path.join("/", bundler.options.bundleOptions.entry))
      : bundler.resolve("/");

   let result: IDependency[] = [];

   if (!entrySource) {
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
         path.extname(entrySource).toLowerCase()
      )
   ) {
      bundler.hooks.trigger("onError", assetStrictlyHTMLorJSError(entrySource));
      return result;
   }

   result = getGraphRecursive(bundler, entrySource);

   return result;
}
