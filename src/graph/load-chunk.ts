import { BuildHookContext, LoadResult } from "../plugin/hook-types.js";
import { PartialContext } from "../plugin/PluginManager.js";
import { Toypack } from "../Toypack.js";
import {
   mergeSourceMaps,
   isSupported,
   loaderNotFoundError,
   Asset,
   ResourceAsset,
} from "../utils";

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
   const type = this._getTypeFromSource(rawSource);

   const loaded: LoadChunkResult = {
      type: type,
      content: asset?.content || undefined,
      asset: asset || (importer ? graph[importer] : null),
   } as LoadChunkResult;
   
   await this._pluginManager.triggerHook(
      "load",
      () => [
         {
            ...loaded,
            source: rawSource,
            isEntry: isEntry,
         },
      ],
      (result) => {
         if (typeof result == "string") {
            loaded.content = result;
         } else {
            loaded.content = result.content;

            if (result.type) {
               loaded.type = result.type;
            }

            if (loaded.type == "script" || loaded.type == "style") {
               loaded.map = result.map;
            }
         }
      },
      {
         bundler: this,
         graph,
         importer,
      }
   );

   const loaders = this._getLoadersFor(rawSource);
   for (const loader of loaders) {
      const loaderResult = loader.compile({
         ...loaded,
         source: rawSource,
         isEntry: isEntry,
      });

      if (typeof loaderResult == "string") {
         loaded.content = loaderResult;
      } else {
         loaded.content = loaderResult.content;

         if (loaderResult.type) {
            loaded.type = loaderResult.type;
         }

         if (loaded.type == "script" || loaded.type == "style") {
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
      (!isSupported(rawSource) && !loaders.length)
   ) {
      this._trigger("onError", loaderNotFoundError(rawSource));
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
   map?: LoadResult["map"];
}

export type LoadChunkResult = LoadChunkResource | LoadChunkText;
