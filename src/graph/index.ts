import path from "path-browserify";
import { IAssetResource, IAssetText } from "../asset.js";
import {
   invalidEntryError,
   entryNotFoundError,
   resolveFailureError,
} from "../errors.js";
import { Toypack } from "../Toypack.js";
import { parseURL } from "../utils.js";
import { createDependency, IDependency } from "./createDependency.js";
import { parseAsset } from "./parseAsset.js";

/**
 * Recursively get the dependency graph of an asset.
 * @returns An array of dependency objects.
 */
async function getGraphRecursive(this: Toypack, entry: IAssetText) {
   const graph: IDependencyGraph = {};
   const recurse = async (source: string, content: string | Blob) => {
      // Avoid dependency duplication in the graph
      if (graph[source]) {
         return;
      }

      // No need to parse a resource dependency
      if (this.hasExtension("resource", source)) {
         const asset = this.getAsset(source) as IAssetResource;
         graph[source] = createDependency("resource", {
            asset,
            chunkSource: source
         });
         return;
      }

      const parsed = await parseAsset.call(this, source, content);
      const dependencyMap: Record<string, string> = {};
      const rawChunkSources: string[] = [];

      // Add script chunks to graph
      for (const script of parsed.scripts) {
         graph[script.chunkSource] = createDependency("script", {
            AST: script.AST,
            chunkSource: script.chunkSource,
            content: script.content,
            map: script.map,
            dependencyMap,
            rawChunkSources: script == parsed.scripts[0] ? rawChunkSources : [],
            isEntry: source == entry.source,
            original: {
               source: parsed.original.source,
               /** @todo fix without string inference */
               content: parsed.original.content as string,
            },
         });

         rawChunkSources.push(script.chunkSource);
      }

      // Add style chunks to graph
      for (const style of parsed.styles) {
         graph[style.chunkSource] = createDependency("style", {
            AST: style.AST,
            chunkSource: style.chunkSource,
            content: style.content,
            map: style.map,
            dependencyMap,
            rawChunkSources: style == parsed.styles[0] ? rawChunkSources : [],
            original: {
               source: parsed.original.source,
               /** @todo fix without string inference */
               content: parsed.original.content as string,
            },
         });

         rawChunkSources.push(style.chunkSource);
      }

      // Add the main. main = first item in the chunks array
      if (this.hasExtension("script", source)) {
         graph[source] = graph[parsed.scripts[0].chunkSource];
      } else if (this.hasExtension("style", source)) {
         graph[source] = graph[parsed.styles[0].chunkSource];
      }

      // Recursively scan dependency for dependencies
      for (const rawDepSource of parsed.dependencies) {
         const parsedDepSource = parseURL(rawDepSource);
         const relativeSource = parsedDepSource.target;
         const depAsset = this.getAsset(
            this.resolve(relativeSource, {
               baseDir: path.dirname(source),
            }) || ""
         );
         if (!depAsset) {
            this.hooks.trigger(
               "onError",
               resolveFailureError(relativeSource, source)
            );
            break;
         }
         dependencyMap[rawDepSource] = depAsset.source;

         await recurse(
            depAsset.source + parsedDepSource.query,
            depAsset.content
         );
      }
   };

   await recurse(entry.source, entry.content);

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
