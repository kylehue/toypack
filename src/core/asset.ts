import { isURL, getBtoa } from "@toypack/utils";
import path from "path-browserify";
import Toypack, { textExtensions } from "./Toypack";
import { IAsset } from "./types";
import mime from "mime-types";

function getLoader(bundler: Toypack, source: string) {
   for (let loader of bundler.loaders) {
      if (loader.test.test(source)) {
         return loader;
      }
   }
}

var lastId = 0;

export function create(
   bundler: Toypack,
   source: string,
   content: string | ArrayBuffer
): IAsset {
   let isExternal = isURL(source);
   source = isExternal ? source : path.join("/", source);

   let id = ++lastId;
   let type = mime.lookup(source) || "";
   let extension = path.extname(source);
   let loader = getLoader(bundler, source);

   if (!loader) {
      throw new Error(
         `Asset Error: ${source} is not supported. You might want to add a loader for this file type.`
      );
   }

   let name = "asset-" + id + extension;
   let isResource = !textExtensions.includes(extension);
   let isObscure = isResource || isExternal;

   let asset: IAsset = {
      id,
      name,
      source,
      content,
      type,
      extension,
      loader,
      loaderData: {
         parse: null,
         compile: null,
      },
      dependencyMap: {},
      params: {},
      parsedSource: source,
      isObscure,
      isExternal,
      isResource,
      isModified: true,
      contentURL: "",
      blob: {} as Blob,
   };

   return asset;
}

export interface AssetOptions {
   requestOptions?: RequestInit;
}

export async function add(
   bundler: Toypack,
   source: string,
   content: string | ArrayBuffer = "",
   options?: AssetOptions
): Promise<IAsset> {
   let isExternal = isURL(source);
   source = isExternal ? source : path.join("/", source);
   let cached = bundler.assets.get(source);

   if (cached) {
      if (cached.content === content || isURL(cached.source)) {
         return cached;
      }

      cached.content = content;
   }

   let asset: IAsset = cached ? cached : create(bundler, source, content);

   // Fetch if source is external url and not cached
   if (isExternal && !cached) {
      let fetchResponse = await fetch(source, options?.requestOptions);
      if (!asset.isResource) {
         asset.content = await fetchResponse.text();
      } else {
         asset.content = await fetchResponse.arrayBuffer();
      }
   }

   // Create blob
   asset.blob = new Blob([asset.content], {
      type: asset.type,
   });

   // Create url
   let assetURL: string = "";
   if (bundler.options.bundleOptions?.mode == "production") {
      if (isURL(asset.source)) {
         assetURL = asset.source;
      } else {
         if (bundler.options.bundleOptions?.output?.resourceType == "inline") {
            let base64 = getBtoa(asset.content);
            assetURL = `data:${asset.type};base64,${base64}`;
         } else {
            assetURL = asset.name;
         }
      }
   } else {
      // Revoke previous URL if there's one
      if (asset?.contentURL?.startsWith("blob:")) {
         URL.revokeObjectURL(asset?.contentURL);
      }

      assetURL = URL.createObjectURL(asset.blob);
   }

   asset.contentURL = assetURL;

   // Out
   if (!cached) {
      bundler.assets.set(asset.source, asset);
   }

   return asset;
}
