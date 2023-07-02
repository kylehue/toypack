import { RawSourceMap } from "source-map-js";

export function createAsset<T extends string | Blob>(
   source: string,
   content: T,
   options?: {
      metadata?: AssetBase["metadata"];
      map?: RawSourceMap | null
   }
): Asset<T> {
   const type: Asset["type"] = typeof content == "string" ? "text" : "resource";
   const asset: Asset<T> = {
      type,
      source,
      content,
      metadata: options?.metadata || {},
      map: options?.map || null,
   } as Asset<T>;

   if (asset.type == "text") {
      asset.modified = true;
   } else {
      asset.contentURL = URL.createObjectURL(asset.content);
   }

   return asset;
}

interface AssetBase {
   source: string;
   modified: boolean;
   metadata: Record<string, any>;
}

export interface ResourceAsset extends AssetBase {
   type: "resource";
   content: Blob;
   contentURL: string;
}

export interface TextAsset extends AssetBase {
   type: "text";
   content: string;
   map?: RawSourceMap | null;
}

export type Asset<T = unknown> = T extends string
   ? TextAsset
   : T extends ResourceAsset
   ? ResourceAsset
   : TextAsset | ResourceAsset;