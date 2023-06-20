import { IAsset, IAssetResource, IAssetText } from "../utils/create-asset.js";
import { Toypack } from "../Toypack.js";
import { BuildHookContext, LoadResult } from "../plugin/hooks.js";
import { mergeSourceMaps } from "../utils/merge-source-maps.js";

/**
 * Load a chunk by its source.
 * @returns An object containing the loaded contents.
 */
export async function loadChunk(
   this: Toypack,
   rawSource: string,
   context: BuildHookContext
) {
   const asset = this.getAsset(rawSource);
   let type: "script" | "style" | "resource" | null = null;
   if (this.hasExtension("script", rawSource)) {
      type = "script";
   } else if (this.hasExtension("style", rawSource)) {
      type = "style";
   } else if (
      this.hasExtension("resource", rawSource) ||
      asset?.type == "resource"
   ) {
      type = "resource";
   }

   const loaded: LoadChunkResult = {
      type,
      content: asset?.content,
      asset,
   } as LoadChunkResult;

   await this._pluginManager.triggerHook(
      "load",
      () => [
         {
            asset,
            source: rawSource,
            content: loaded.content,
            isEntry: context.isEntry,
         },
      ],
      (result) => {
         loaded.type = result.type;
         loaded.content = result.content;

         if (loaded.type == "script" || loaded.type == "style") {
            loaded.map = result.map;
         }
      },
      context
   );

   if (typeof loaded.type != "string" || typeof loaded.content == "undefined") {
      let source = asset?.source || rawSource;
      throw new Error("Failed to load a module: " + source);
   }

   return loaded;
}

export interface LoadChunkResource {
   type: "resource";
   content: Blob;
   asset?: IAssetResource | null;
}

export interface LoadChunkText {
   type: "script" | "style";
   content: string;
   asset?: IAssetText | null;
   map?: LoadResult["map"];
}

export type LoadChunkResult = LoadChunkResource | LoadChunkText;
