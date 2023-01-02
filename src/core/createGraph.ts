import { isURL, isLocal } from "@toypack/utils";
import path from "path-browserify";
import { FailedResolveDescriptor } from "./Hooks";
import { getResolveAliasData } from "./resolve";
import Toypack from "./Toypack";
import { IAsset, ParsedAsset } from "./types";

export default async function createGraph(
   bundler: Toypack,
   source: string,
   graph: IAsset[] = []
) {
   let isExternal = isURL(source);
   source = isExternal ? source : path.join("/", source);

   const asset = bundler.assets.get(source);

   if (!asset) {
      throw new Error(`Graph Error: Cannot find asset ${source}`);
   }

   if (
      isExternal ||
      typeof asset.content != "string" ||
      typeof asset.loader.parse != "function"
   ) {
      graph.push(asset);
      asset.isModified = false;
   } else {
      let parseData: ParsedAsset = { dependencies: [] };
      let cached = bundler._assetCache.get(source);
      asset.isModified = asset.content !== cached?.content;
      // Reuse the old parse data if content didn't change
      if (!asset.isModified && asset?.loaderData.parse) {
         parseData = asset.loaderData.parse;
      } else {
         parseData = await asset.loader.parse(asset, bundler);
      }

      // Update asset's loader data
      asset.loaderData.parse = parseData;
      asset.dependencyMap = {};

      // Add to graph
      graph.push(asset);

      // Cache
      bundler._assetCache.set(asset.source, Object.assign({}, asset));

      // Scan asset's dependencies
      for (let dependency of parseData.dependencies) {
         let dependencyAbsolutePath: string = dependency;
         let baseDir = path.dirname(source);
         let isExternal = isURL(dependency);
         let isCoreModule = !isLocal(dependency) && !isExternal;

         // Check if aliased
         let aliasData = getResolveAliasData(bundler, dependency);
         if (aliasData) {
            isCoreModule =
               !isLocal(aliasData.replacement) && !isURL(aliasData.replacement);
         }

         // If not a url, resolve
         if (!isExternal) {
            // Resolve
            let resolved = await bundler.resolve(dependency, {
               baseDir,
            });

            if (!resolved) {
               await bundler.hooks.trigger("failedResolve", {
                  target: dependency,
                  parent: asset,
                  changeResolved(newResolved: string) {
                     resolved = newResolved;
                  },
               } as FailedResolveDescriptor);
            }

            if (resolved) {
               dependencyAbsolutePath = resolved;
            }
         } else {
            // If a URL and not in cache, add to assets
            if (!bundler._assetCache.get(dependency)) {
               await bundler.addAsset(dependency);
            }
         }

         let dependencyAsset = bundler.assets.get(dependencyAbsolutePath);

         if (dependencyAsset) {
            // Add to dependency mapping
            asset.dependencyMap[dependency] = dependencyAsset.id;

            // Scan
            let isAdded = graph.some(
               (asset) => asset.source == dependencyAbsolutePath
            );

            if (!isAdded) {
               await createGraph(bundler, dependencyAbsolutePath, graph);
            }
         } else {
            throw new Error(
               `Graph Error: Could not resolve "${dependencyAbsolutePath}" at "${source}".`
            );
         }
      }
   }

   return graph;
}
