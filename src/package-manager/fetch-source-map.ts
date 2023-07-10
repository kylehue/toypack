import { EncodedSourceMap } from "@jridgewell/gen-mapping";
import { getSourceMapUrl } from "../utils";
import { resolve, _cache } from "./utils";

export async function fetchSourceMapInContent(content: string, url: string) {
   let sourceMap: EncodedSourceMap | null = null;
   const cached = _cache.get(url);
   if (cached && cached.type != "resource" && cached.map) {
      sourceMap = cached.map;
   } else {
      const sourceMapUrl = getSourceMapUrl(content);
      if (sourceMapUrl) {
         const resolvedMapUrl = resolve(sourceMapUrl, url);
         const mapResponse = await fetch(resolvedMapUrl);
         if (mapResponse) {
            sourceMap = await mapResponse.json();
         }
      }
   }

   return sourceMap;
}
