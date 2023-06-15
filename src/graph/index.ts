import path from "path-browserify";
import { IAssetResource, IAssetText } from "../asset.js";
import {
   invalidEntryError,
   entryNotFoundError,
   resolveFailureError,
   assetNotFoundError,
} from "../errors.js";
import { Toypack } from "../Toypack.js";
import { parseURL } from "../utils.js";
import { createDependency, IDependency } from "./createDependency.js";
import {
   IParsedAsset,
   IParsedScript,
   IParsedStyle,
   parseAsset,
} from "./parseAsset.js";

/**
 * Recursively get the dependency graph of an asset.
 * @returns An array of dependency objects.
 */
async function getGraphRecursive(this: Toypack, entry: IAssetText) {
   const graph: IDependencyGraph = {};

   const adjustDependencyMapsFromChunk = (
      chunk: IParsedScript | IParsedStyle
   ) => {
      const chainedExtensionRegex = new RegExp(
         "\\b" + chunk.chainedExtension + "\\b",
         "g"
      );
      for (const chunkSource in graph) {
         const dep = graph[chunkSource];
         if (dep.type == "resource") continue;
         for (const [rel, abs] of Object.entries(dep.dependencyMap)) {
            if (chunk.chunkSource.replace(chainedExtensionRegex, "") == abs) {
               dep.dependencyMap[rel] = chunk.chunkSource;
            }
         }
      }
   };

   const recurse = async (
      rawSource: string,
      content: string | Blob,
      isEntry = false
   ) => {
      // Avoid dependency duplication in the graph
      if (graph[rawSource]) {
         return;
      }

      const parsedSource = parseURL(rawSource);
      const asset = this.getAsset(parsedSource.target);
      if (!asset) {
         this.hooks.trigger("onError", assetNotFoundError(rawSource));
         return;
      }

      // No need to parse a resource dependency
      if (asset.type == "resource") {
         graph[rawSource] = createDependency("resource", {
            asset,
            chunkSource: rawSource,
         });
         return;
      }

      let parsed: IParsedAsset;

      // Cache
      const cached = this.cachedDeps.parsed.get(rawSource);
      if (cached && !asset.modified) {
         parsed = cached.parsed;
      } else {
         parsed = await parseAsset.call(this, rawSource, content);
         this.cachedDeps.parsed.set(rawSource, {
            asset,
            parsed,
         });
      }

      const dependencyMap: Record<string, string> = {};
      const rawChunkDependencies: string[] = [];

      // Add script chunks to graph
      for (const script of parsed.scripts) {
         graph[script.chunkSource] = createDependency("script", {
            AST: script.AST,
            chunkSource: script.chunkSource,
            content: script.content,
            map: script.map,
            dependencyMap,
            rawChunkDependencies:
               script == parsed.scripts[0] ? rawChunkDependencies : [],
            isEntry,
            asset,
         });

         rawChunkDependencies.push(script.chunkSource);
         adjustDependencyMapsFromChunk(script);
      }

      // Add style chunks to graph
      for (const style of parsed.styles) {
         graph[style.chunkSource] = createDependency("style", {
            AST: style.AST,
            chunkSource: style.chunkSource,
            content: style.content,
            map: style.map,
            dependencyMap,
            rawChunkDependencies:
               style == parsed.styles[0] ? rawChunkDependencies : [],
            asset,
         });

         rawChunkDependencies.push(style.chunkSource);
         adjustDependencyMapsFromChunk(style);
      }

      // Recursively scan dependency for dependencies
      for (const rawDepSource of parsed.dependencies) {
         const parsedDepSource = parseURL(rawDepSource);
         const relativeSource = parsedDepSource.target;
         const depAsset = this.getAsset(
            this.resolve(relativeSource, {
               baseDir: path.dirname(rawSource),
            }) || ""
         );
         if (!depAsset) {
            this.hooks.trigger(
               "onError",
               resolveFailureError(relativeSource, rawSource)
            );
            break;
         }

         const absoluteSourceQuery = depAsset.source + parsedDepSource.query;
         dependencyMap[rawDepSource] = absoluteSourceQuery;
         await recurse(absoluteSourceQuery, depAsset.content);
      }
   };

   await recurse(entry.source, entry.content, true);

   return graph;
}

/**
 * Get the dependency graph of the bundler starting from the entry point.
 * @returns An array of dependency objects. The first item in the array
 * is the entry.
 */
export async function getDependencyGraph(this: Toypack) {
   let graph: IDependencyGraph = {};
   const entrySource = this.config.bundle.entry
      ? this.resolve(path.join("/", this.config.bundle.entry))
      : this.resolve("/");

   const entryAsset = entrySource ? this.getAsset(entrySource) : null;

   if (!entryAsset) {
      this.hooks.trigger("onError", entryNotFoundError());
      return graph;
   }

   if (entryAsset.type != "text") {
      this.hooks.trigger("onError", invalidEntryError(entryAsset.source));
      return graph;
   }

   graph = await getGraphRecursive.call(this, entryAsset);

   return graph;
}

export type IDependencyImportParams = Record<string, string | boolean>;
export type IDependencyGraph = Record<string, IDependency>;
