import path from "path-browserify";
import { IAsset, IAssetText } from "../asset.js";
import {
   invalidEntryError,
   entryNotFoundError,
   resolveFailureError,
} from "../errors.js";
import { Toypack } from "../Toypack.js";
import { parseURL } from "../utils.js";
import { createDependency, IDependency } from "./createDependency.js";
import { IParsedScript, IParsedStyle, parseAsset } from "./parseAsset.js";
import { loadAsset } from "./loadAsset.js";

/**
 * Recursively get the dependency graph of an asset.
 * @returns An array of dependency objects.
 */
async function getGraphRecursive(this: Toypack, entry: IAssetText) {
   const graph: IDependencyGraph = {};

   const recurse = async (
      source: string,
      content: string | Blob,
      params: IDependencyImportParams = {}
   ) => {
      if (graph[source]) {
         return;
      }

      const parsed = await parseAsset.call(this, source, content, params);
      const dependencyMap: Record<string, string> = {};
      for (const script of parsed.scripts) {
         graph[script.chunkSource] = script;
      }

      for (const style of parsed.styles) {
         graph[style.chunkSource] = style;
      }

      if (this.hasExtension("script", source)) {
         graph[source] = parsed.scripts[0];
      } else if (this.hasExtension("style", source)) {
         graph[source] = parsed.styles[0];
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
            depAsset.source,
            depAsset.content,
            parsedDepSource.params
         );
      }
   };

   await recurse(entry.source, entry.content);

   // const recurse = async (
   //    asset: IAsset,
   //    params: IDependencyImportParams = {}
   // ) => {
   //    // Avoid dependency duplication in the graph
   //    if (graph[asset.source]) {
   //       return;
   //    }

   //    // Parse and get dependencies
   //    const parsed = await parseAsset.call(
   //       this,
   //       asset.source,
   //       asset.content,
   //       params
   //    );

   //    // No need to parse a resource dependency
   //    if (asset.type == "resource") {
   //       graph[asset.source] = createDependency("resource", {
   //          asset,
   //       });

   //       return;
   //    }

   //    const dependencyMap: Record<string, string> = {};

   //    graph[asset.source] = createDependency(parsed.type, {
   //       asset,
   //       dependencyMap,
   //       parsed: parsed,
   //    });

   //    // Scan asset's dependencies for dependencies
   //    for (const rawDepSource of parsed.dependencies) {
   //       const parsedURL = parseURL(rawDepSource);
   //       const relativeSource = parsedURL.target;

   //       const depAsset = this.getAsset(
   //          this.resolve(relativeSource, {
   //             baseDir: path.dirname(asset.source),
   //          }) || ""
   //       );

   //       if (!depAsset) {
   //          this.hooks.trigger(
   //             "onError",
   //             resolveFailureError(relativeSource, asset.source)
   //          );
   //          continue;
   //       }

   //       dependencyMap[rawDepSource] = depAsset.source;

   //       await recurse(depAsset, parsedURL.params);
   //    }
   // };

   // await recurse(entry);

   return graph;
}

/**
 * Get the dependency graph of the bundler starting from the entry point.
 * @returns An array of dependency objects. The first item in the array
 * is the entry.
 */
export async function getDependencyGraph(this: Toypack) {
   let graph: IDependencyGraph = {};
   const entrySource = this.options.bundleOptions.entry
      ? this.resolve(path.join("/", this.options.bundleOptions.entry))
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
export type IDependencyGraph = Record<string, IParsedScript | IParsedStyle>;
