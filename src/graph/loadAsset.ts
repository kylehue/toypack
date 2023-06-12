import path from "path-browserify";
import { RawSourceMap } from "source-map-js";
import { loaderNotFoundError } from "../errors.js";
import { ILoaderData, Toypack } from "../Toypack.js";
import { supportedExtensions } from "../extensions.js";
import { createChunkSource, mergeSourceMaps, parseURL } from "../utils.js";

/**
 * Loads an asset's content using loaders.
 * @returns The chunks of the asset. The first item in the scripts/styles
 * array is the asset's entry.
 */
export async function loadAsset(
   this: Toypack,
   source: string,
   content: string | Blob
) {
   const loadedAssetResult = {
      scripts: [] as IAssetChunk[],
      styles: [] as IAssetChunk[],
   };

   const addToResult = (
      sourceToAdd: string,
      contentToAdd: string | Blob,
      map?: RawSourceMap
   ) => {
      let key: "scripts" | "styles" | null = null;
      if (this.hasExtension("script", sourceToAdd)) {
         key = "scripts";
      } else if (this.hasExtension("style", sourceToAdd)) {
         key = "styles";
      }

      if (key) {
         const group = loadedAssetResult[key];
         const extname = path.extname(sourceToAdd);
         const chunkSource = createChunkSource(
            sourceToAdd.replace(new RegExp(extname + "$"), ""),
            extname.replace(/^\./, ""),
            group.length
         );
         group.push({
            chunkSource: chunkSource,
            content: contentToAdd,
            map,
         });
      }
   };

   const loadRecursively = async (
      rawSource: string,
      contentToLoad: string | Blob,
      map?: RawSourceMap
   ) => {
      const parsedSource = parseURL(rawSource);
      // No need to load if source is already supported
      if (supportedExtensions.includes(path.extname(parsedSource.target))) {
         addToResult(rawSource, contentToLoad, map);
         return;
      }

      // Get loaders
      const loaders: ILoaderData[] = [];
      for (const loader of this.loaders) {
         const tester = loader.test;
         let hasMatched = false;
         if (
            (typeof tester == "function" &&
               tester(parsedSource.target, parsedSource.params)) ||
            (tester instanceof RegExp && tester.test(parsedSource.target))
         ) {
            hasMatched = true;
         }

         if (hasMatched) {
            loaders.push(loader);
            if (loader.chaining === false) break;
         }
      }

      if (
         !loaders.length &&
         !supportedExtensions.includes(path.extname(parsedSource.target))
      ) {
         this.hooks.trigger("onError", loaderNotFoundError(source));
         return;
      }

      // Load content with each of the loaders
      for (let i = loaders.length - 1; i >= 0; i--) {
         const loader = loaders[i];
         const compileResult = await loader.compile({
            source: parsedSource.target,
            content: contentToLoad,
            params: parsedSource.params,
         });

         // Load chunks recursively until it becomes supported
         // This is for files like .vue that could emit .sass chunks
         const chunkCollection = compileResult.contents
            ? Object.entries(compileResult.contents)
            : [];

         for (const [lang, chunks] of chunkCollection) {
            const dummyChunkSource = parsedSource.target + "." + lang;
            for (const chunk of chunks) {
               const chunkSourceMap =
                  map && chunk.map
                     ? mergeSourceMaps(map, chunk.map)
                     : chunk.map;

               await loadRecursively(
                  dummyChunkSource,
                  chunk.content,
                  chunkSourceMap
               );
            }
         }
      }
   };

   await loadRecursively(source, content);

   return loadedAssetResult;
}

export interface IAssetChunk {
   chunkSource: string;
   content: string | Blob;
   map?: RawSourceMap;
}
