import path from "path-browserify";
import { IAssetResource, IAssetText } from "../asset.js";
import {
   invalidEntryError,
   entryNotFoundError,
   resolveFailureError,
   assetNotFoundError,
} from "../errors.js";
import { Toypack } from "../Toypack.js";
import { mergeSourceMaps, parseURL } from "../utils.js";
import { RawSourceMap } from "source-map-js";
import { parseScriptAsset } from "./parseScriptAsset.js";
import { parseStyleAsset } from "./parseStyleAsset.js";
import { LoadBuildHook } from "../buildHooks.js";

/**
 * Recursively get the dependency graph of an asset.
 * @returns An array of dependency objects.
 */
async function getGraphRecursive(this: Toypack, entry: IAssetText) {
   const graph: IDependencyGraph = {};
   const config = this.getConfig();
   const bundleMode = config.bundle.mode;

   const recurse = async (rawSource: string, isEntry = false) => {
      let loaded: NonNullable<ReturnType<LoadBuildHook>> = {
         content: isEntry ? entry.content : "",
      };

      this._triggerBuildHook(
         "load",
         (result) => {
            loaded.content = result.content;
            if (loaded.map && result.map) {
               loaded.map = mergeSourceMaps(loaded.map, result.map);
            } else {
               loaded.map = result.map;
            }

            // Update args
            return [{ content: loaded.content, source: rawSource }];
         },
         [{ content: loaded.content, source: rawSource }]
      );
      

      const parsed = this.hasExtension("script", rawSource)
         ? await parseScriptAsset.call(this, rawSource, loaded.content)
         : await parseStyleAsset.call(this, rawSource, loaded.content);

      console.log(parsed);

      // for (const dep of parsed.dependencies) {
      //    let resolved: string = dep;
      //    if (this._buildHooks.resolve) {
      //       for (const hookFunction of this._buildHooks.resolve) {
      //          const result = await hookFunction(resolved);

      //          if (!result) continue;

      //          loaded.content = result.content;
      //          loaded.map =
      //             loaded.map && result.map
      //                ? mergeSourceMaps(loaded.map, result.map)
      //                : result.map;

      //          if (result.disableChaining === true) break;
      //       }
      //    }

      //    await recurse(resolved);
      // }
   };

   await recurse(entry.source, true);

   return graph;
}

/**
 * Get the dependency graph of the bundler starting from the entry point.
 * @returns An array of dependency objects. The first item in the array
 * is the entry.
 */
export async function getDependencyGraph(this: Toypack) {
   let graph: IDependencyGraph = {};
   const config = this.getConfig();
   const entrySource = config.bundle.entry
      ? this.resolve(path.join("/", config.bundle.entry))
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

export type IDependencyGraph = Record<string, any>;
