import { isURL, isLocal } from "@toypack/utils";
import path, { parse } from "path-browserify";
import { create } from "./asset";
import { FailedResolveDescriptor } from "./Hooks";
import { getResolveAliasData } from "./resolve";
import Toypack from "./Toypack";
import {
   DependencyData,
   IAsset,
   ParsedAsset,
   ToypackLoader,
   UseLoader,
} from "./types";

async function parseStruct(struct: UseLoader, bundler: Toypack) {
   const result = {
      failedLoader: false,
      dependencies: [] as DependencyData[],
   };

   const init = async (struct: UseLoader) => {
      for (let [lang, chunks] of Object.entries(struct)) {
         // Get loader
         let loader: ToypackLoader | null = null;
         let mockName = "asset." + lang;
         for (let ldr of bundler.loaders) {
            if (ldr.test.test(mockName)) {
               loader = ldr;
               break;
            }
         }

         // Compile
         if (loader) {
            if (typeof loader.parse == "function") {
               for (let chunk of chunks) {
                  let mockAsset = create(bundler, mockName, chunk.content);
                  let parsed = await loader.parse(mockAsset, bundler);
                  
                  if (parsed.use) {
                     await init(parsed.use);
                  } else {
                     result.dependencies.push(...parsed.dependencies);
                  }
               }
            }
         } else {
            result.failedLoader = true;
            return result;
         }
      }
   };

   await init(struct);
   return result;
}

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

      if (parseData.use) {
         let parsedStruct = await parseStruct(parseData.use, bundler);
         if (parsedStruct.failedLoader) {
            throw new Error(
               `Asset Parse Error: Could not parse ${asset.source} because it relies on loaders that are not present.`
            );
         } else {
            parseData.dependencies.push(...parsedStruct.dependencies);
         }
      }

      // Filter
      if (typeof parseData.filter == "function") {
         for (let i = 0; i < parseData.dependencies.length; i++) {
            let dep = parseData.dependencies[i];

            let isAccepted = parseData.filter(dep);

            if (!isAccepted) {
               parseData.dependencies.splice(i, 1);
            }
         }
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
         let dependencyAbsolutePath: string = dependency.source;
         let baseDir = path.dirname(source);
         let isExternal = isURL(dependency.source);
         /* let isCoreModule = !isLocal(dependency.source) && !isExternal;

         // Check if aliased
         let aliasData = getResolveAliasData(bundler, dependency.source);
         if (aliasData) {
            isCoreModule =
               !isLocal(aliasData.replacement) && !isURL(aliasData.replacement);
         } */

         // If not a url, resolve
         if (!isExternal) {
            // Resolve
            let resolved = await bundler.resolve(dependency.source, {
               baseDir,
            });

            if (!resolved) {
               await bundler.hooks.trigger("failedResolve", {
                  target: dependency.source,
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
            if (!bundler._assetCache.get(dependency.source)) {
               await bundler.addAsset(dependency.source, undefined, {
                  requestOptions: dependency.requestOptions,
               });
            }
         }

         let dependencyAsset = bundler.assets.get(dependencyAbsolutePath);
         if (dependencyAsset) {
            // Add to dependency mapping
            asset.dependencyMap[dependency.source] = dependencyAsset.id;

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
