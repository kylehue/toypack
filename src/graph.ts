import { parse as getAST, ParserOptions } from "@babel/parser";
import traverseAST, { TraverseOptions, Node } from "@babel/traverse";
import path from "path-browserify";
import { Asset } from "./asset.js";
import { Toypack } from "./Toypack.js";
import { parseURLQuery } from "./utils.js";

export interface IDependency {
   asset: Asset;
   params: IModuleOptions;
   AST: Node;
   dependencyMap: Record<string, { relative: string; absolute: string }>;
}

function isJS(source: string) {
   return [".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx"].includes(path.extname(source));
}

function parseModule(bundler: Toypack, asset: Asset) {
   const result = {
      asset,
      dependencies: [] as string[],
      AST: {} as Node,
   };

   if (typeof asset.content != "string") {
      console.error("js assets only supports string content");
      // TODO: trigger "only supports string content" error
      return result;
   }

   const format = bundler.options.bundleOptions.format;

   const AST = getAST(asset.content, {
      sourceType: format == "esm" ? "module" : "script",
      sourceFilename: asset.source,
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
            if (
               ((callee.type == "Identifier" && callee.name == "require") ||
                  callee.type == "Import") &&
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
   const currentAsset = bundler.assets.get(path.join("/", entry));
   if (!currentAsset) {
      // TODO: trigger "file not found" error
      console.error("file not found: " + entry);
      return graph;
   }

   if (graph.some((dep) => dep.asset.source == currentAsset.source)) {
      return graph;
   }

   const currentDepParsed = parseModule(bundler, currentAsset);

   const parentDep: IDependency = {
      asset: currentAsset,
      params,
      AST: currentDepParsed.AST,
      dependencyMap: {}
   }

   graph.push(parentDep);

   for (const childDepRelativeSource of currentDepParsed.dependencies) {
      if (params.raw) {
         break;
      }

      const childDepURLQuery = parseURLQuery(childDepRelativeSource);

      const childDepAbsoluteSource = bundler.resolve(childDepURLQuery.target, {
         baseDir: path.dirname(currentAsset.source),
      });

      parentDep.dependencyMap[childDepRelativeSource] = {
         relative: childDepRelativeSource,
         absolute: childDepAbsoluteSource
      };

      getGraphRecursive(
         bundler,
         childDepAbsoluteSource,
         childDepURLQuery.params,
         graph
      );
   }

   /* const dep: IDependency = {
      asset: currentAsset,
      params,
   };

   const loader = bundler.loaders.find((ldr) =>
      ldr.test.test(currentAsset.source)
   );
   if (!loader) {
      // TODO: trigger "file has no loader" error
      console.error("file has no loader: " + entry);
      return graph;
   } else {
      dependencies = loader.parse(dep).dependencies;
   }

   if (isJS(currentAsset.source) && typeof currentAsset.content == "string") {
      dependencies = parseJS(bundler, currentAsset);
   } else {
      
   }
   

   graph.push(dep);

   for (let depRelativeSource of dependencies) {
      // No need to get dependencies of a module if the requestor needs it raw
      if (params.raw) {
         break;
      }

      let parsedSourceQuery = parseURLQuery(depRelativeSource);

      let depAbsoluteSource = bundler.resolve(parsedSourceQuery.target, {
         baseDir: path.dirname(currentAsset.source),
      });

      getGraphRecursive(
         bundler,
         depAbsoluteSource,
         parsedSourceQuery.params,
         graph
      );
   } */

   return graph;
}

export function getDependencyGraph(bundler: Toypack) {
   const entrySource = bundler.options.bundleOptions.entry;
   if (![".js", ".html"].includes(path.extname(entrySource).toLowerCase())) {
      // TODO: trigger "entry should only either be html or js" error
      console.error("entry should only either be html or js");
      return [];
   }

   return getGraphRecursive(bundler, entrySource);
}
