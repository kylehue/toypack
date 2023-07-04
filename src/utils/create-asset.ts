import { RawSourceMap } from "source-map-js";

export function createAsset<T extends string | Blob>(
   source: string,
   content: T,
   options?: AssetOptions
): Asset<T> {
   const common = {
      source,
      metadata: options?.metadata || {},
      modified: false,
      forceContentTypeAs: options?.forceContentTypeAs,
   };

   let asset: Asset;
   if (typeof content == "string") {
      asset = {
         ...common,
         type: "text",
         content,
         map: options?.map || null,
      };
   } else {
      asset = {
         ...common,
         type: "resource",
         content,
         contentURL: URL.createObjectURL(content),
      };
   }

   return asset as Asset<T>;
}

export interface AssetOptions {
   metadata?: AssetBase["metadata"];
   map?: RawSourceMap | null;
   forceContentTypeAs?: "script" | "style";
}

interface AssetBase {
   source: string;
   modified: boolean;
   metadata: Record<string, any>;
   forceContentTypeAs?: "script" | "style";
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