export function createAsset<T extends string | Blob>(
   source: string,
   content: T
): IAsset<T> {
   const type: IAsset["type"] = typeof content == "string" ? "text" : "resource";
   const asset: IAsset<T> = {
      type,
      source,
      content,
   } as IAsset<T>;

   if (asset.type == "text") {
      asset.modified = true;
   } else {
      asset.contentURL = URL.createObjectURL(asset.content);
   }

   return asset;
}

interface IAssetBase {
   source: string;
   modified: boolean;
}

export interface IAssetResource extends IAssetBase {
   type: "resource";
   content: Blob;
   contentURL: string;
}

export interface IAssetText extends IAssetBase {
   type: "text";
   content: string;
}

export type IAsset<T = unknown> = T extends string
   ? IAssetText
   : T extends IAssetResource
   ? IAssetResource
   : IAssetText | IAssetResource;