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
import { parseAsset } from "./parseAsset.js";

/**
 * Recursively get the dependency graph of an asset.
 * @returns An array of dependency objects.
 */
async function getGraphRecursive(this: Toypack, entry: IAssetText) {
   const graph: IDependency[] = [];
   const recurse = async (
      asset: IAsset,
      params: IDependencyImportParams = {}
   ) => {
      // Avoid dependency duplication in the graph
      if (graph.some((dep) => dep.asset.source == asset.source)) {
         return;
      }

      // No need to parse a resource dependency
      if (asset.type == "resource") {
         graph.push(
            createDependency("resource", {
               asset,
            })
         );

         return;
      }

      // Parse and get dependencies
      const parsed = await parseAsset.call(
         this,
         asset.source,
         asset.content,
         params
      );

      const dependencyMap: Record<string, string> = {};

      graph.push(
         createDependency(parsed.type, {
            asset,
            dependencyMap,
            parsed: parsed as any,
         })
      );

      // Scan those dependencies for dependencies
      for (const rawDepSource of parsed.dependencies) {
         const parsedURL = parseURL(rawDepSource);
         const relativeSource = parsedURL.target;

         const depAsset = this.getAsset(
            this.resolve(relativeSource, {
               baseDir: path.dirname(asset.source),
            }) || ""
         );

         if (!depAsset) {
            this.hooks.trigger(
               "onError",
               resolveFailureError(relativeSource, asset.source)
            );
            break;
         }

         dependencyMap[relativeSource] = depAsset.source;

         await recurse(depAsset, parsedURL.params);
      }
   };

   await recurse(entry);

   return graph;
}

/**
 * Get the dependency graph of the bundler starting from the entry point.
 * @returns An array of dependency objects.
 */
export async function getDependencyGraph(this: Toypack) {
   const entrySource = this.options.bundleOptions.entry
      ? this.resolve(path.join("/", this.options.bundleOptions.entry))
      : this.resolve("/");

   const result: any[] = [];

   const entryAsset = entrySource ? this.getAsset(entrySource) : null;

   if (!entryAsset) {
      this.hooks.trigger("onError", entryNotFoundError());
      return result;
   }

   if (entryAsset.type != "text") {
      this.hooks.trigger("onError", invalidEntryError(entryAsset.source));
      return;
   }

   const graph = await getGraphRecursive.call(this, entryAsset);

   result.push(...graph);

   return result;
}

export type IDependencyImportParams = Record<string, string | boolean>;
