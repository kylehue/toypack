export function createAsset<T extends string | Blob>(
   source: string,
   content: T
): Asset<T> {
   const type: Asset["type"] = typeof content == "string" ? "text" : "resource";
   const asset: Asset<T> = {
      type,
      source,
      content,
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
}

export interface ResourceAsset extends AssetBase {
   type: "resource";
   content: Blob;
   contentURL: string;
}

export interface TextAsset extends AssetBase {
   type: "text";
   content: string;
}

export type Asset<T = unknown> = T extends string
   ? TextAsset
   : T extends ResourceAsset
   ? ResourceAsset
   : TextAsset | ResourceAsset;