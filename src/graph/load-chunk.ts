import { PartialContext } from "../plugin/PluginManager.js";
import { Toypack } from "../Toypack.js";
import { mergeSourceMaps, isSupported, ERRORS } from "../utils";
import { Asset, ResourceAsset } from "../types";
import { shouldProduceSourceMap } from "../utils/should-produce-source-map.js";
import { RawSourceMap } from "source-map-js";

/**
 * Load a chunk by its source.
 * @param rawSource The source of the chunk to load.
 * @returns An object containing the loaded contents.
 */
export async function loadChunk(
   this: Toypack,
   rawSource: string,
   isEntry: boolean,
   { graph, importer }: PartialContext
) {
   const asset = this.getAsset(rawSource);
   /**
    * Importer can't possibly be undefined if the asset with the rawSource
    * is undefined.
    * Importer only becomes undefined if the rawSource asset is the entry.
    */
   const parentAsset = asset || graph[importer!].asset;
   const type = this._getTypeFromSource(rawSource);
   const config = this.getConfig();
   const sourceMapConfig = config.bundle.sourceMap;
   const shouldMap = shouldProduceSourceMap(
      parentAsset.source,
      sourceMapConfig
   );

   const loaded: LoadChunkResult = {
      type: type,
      content:
         typeof asset?.content == "string" ||
         asset?.content instanceof Blob
            ? asset.content
            : undefined,
      asset: parentAsset,
      map: asset?.type == "text" ? asset.map : null,
   } as LoadChunkResult;

   await this._pluginManager.triggerHook({
      name: "load",
      args: () => [
         {
            ...loaded,
            source: rawSource,
            isEntry: isEntry,
         },
      ],
      context: {
         bundler: this,
         graph,
         importer,
      },
      callback(result) {
         if (typeof result == "string") {
            loaded.content = result;
         } else {
            loaded.content = result.content;

            if (result.type) {
               loaded.type = result.type;
            }

            if (
               shouldMap &&
               (loaded.type == "script" || loaded.type == "style") &&
               (result.type == "script" || result.type == "style")
            ) {
               if (loaded.map && result.map) {
                  loaded.map = mergeSourceMaps(loaded.map, result.map);
               } else if (!loaded.map && result.map) {
                  loaded.map = result.map;
               }
            }
         }
      },
   });

   const loaders = this._getLoadersFor(rawSource);
   for (const { loader, plugin } of loaders) {
      const context = this._pluginManager.createContext(
         {
            bundler: this,
            graph,
            importer,
         },
         plugin
      );

      const loaderResult = loader.compile.call(context, {
         ...loaded,
         source: rawSource,
         isEntry: isEntry,
      });

      if (!loaderResult) continue;

      if (typeof loaderResult == "string") {
         loaded.content = loaderResult;
      } else {
         loaded.content = loaderResult.content;

         if (loaderResult.type) {
            loaded.type = loaderResult.type;
         }

         if (
            shouldMap &&
            (loaded.type == "script" || loaded.type == "style") &&
            (loaderResult.type == "script" || loaderResult.type == "style")
         ) {
            if (loaded.map && loaderResult.map) {
               loaded.map = mergeSourceMaps(loaded.map, loaderResult.map);
            } else if (!loaded.map && loaderResult.map) {
               loaded.map = loaderResult.map;
            }
         }
      }
   }

   if (
      typeof loaded.type != "string" ||
      typeof loaded.content == "undefined" ||
      (!isSupported(rawSource) &&
         !loaders.length &&
         typeof loaded.type != "string")
   ) {
      this._trigger("onError", ERRORS.loaderNotFound(rawSource));
   }

   return loaded;
}

export interface LoadChunkResource {
   type: "resource";
   content: Blob;
   asset: ResourceAsset;
}

export interface LoadChunkText {
   type: "script" | "style";
   content: string;
   asset: Asset;
   map?: RawSourceMap | null;
}

export type LoadChunkResult = LoadChunkResource | LoadChunkText;
