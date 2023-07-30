import { EncodedSourceMap } from "@jridgewell/gen-mapping";
import { getSourceMapUrl } from "../utils";
import { resolve } from "./utils";

export async function fetchSourceMapInContent(content: string, url: string) {
   let sourceMap: EncodedSourceMap | null = null;
   const sourceMapUrl = getSourceMapUrl(content);
   if (sourceMapUrl) {
      const resolvedMapUrl = resolve(sourceMapUrl, url);
      const mapResponse = await fetch(resolvedMapUrl);
      if (mapResponse) {
         sourceMap = await mapResponse.json();
      }
   }

   return sourceMap;
}
