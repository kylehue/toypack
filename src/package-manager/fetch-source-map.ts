import { RawSourceMap } from "source-map-js";
import { PackageProvider } from ".";
import { _cache } from "./fetch-package";
import { getSourceMapUrl } from "../utils";
import { getUrlFromProviderHost, resolve } from "./utils";

export async function fetchSourceMapInContent(
   content: string,
   url: string,
   provider: PackageProvider
) {
   let sourceMap: RawSourceMap | null = null;
   const cached = _cache.get(url);
   if (cached?.map) {
      sourceMap = cached.map;
   } else {
      const sourceMapUrl = getSourceMapUrl(content);
      if (sourceMapUrl) {
         const resolvedMapUrl = resolve(
            sourceMapUrl,
            url,
            getUrlFromProviderHost(provider)
         );
         const mapResponse = await fetch(resolvedMapUrl);
         if (mapResponse) {
            sourceMap = await mapResponse.json();
         }
      }
   }

   return sourceMap;
}
