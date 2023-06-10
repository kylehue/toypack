import path from "path-browserify";
import { RawSourceMap } from "source-map-js";
import { loaderNotFoundError } from "../errors.js";
import { ILoaderData, Toypack } from "../Toypack.js";
import { supportedExtensions } from "../extensions.js";
import { createChunkSource, mergeSourceMaps } from "../utils.js";
import { IDependencyImportParams } from "./index.js";

/**
 * Loads an asset's content using loaders.
 * @returns The chunks of the asset.
 */
export async function loadAsset(
   this: Toypack,
   source: string,
   content: string,
   params: IDependencyImportParams = {}
) {
   const loadedAssetResult = {
      source,
      scripts: [] as IAssetChunk[],
      styles: [] as IAssetChunk[],
   };

   const loadRecursively = async (
      source: string,
      content: string,
      map?: RawSourceMap
   ) => {
      // Get loaders
      const loaders: ILoaderData[] = [];
      for (const loader of this.loaders) {
         const tester = loader.test;
         let hasMatched = false;
         if (
            (typeof tester == "function" && tester(source, params)) ||
            (tester instanceof RegExp && tester.test(source))
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
         !supportedExtensions.includes(path.extname(source))
      ) {
         this.hooks.trigger("onError", loaderNotFoundError(source));
         return;
      }

      // Load content with each of the loaders
      let loadedContent = content;
      let loadedMap = map;
      for (let i = loaders.length - 1; i >= 0; i--) {
         const loader = loaders[i];
         let compileResult;
         const compileData = {
            content: loadedContent,
            params,
            source,
         };

         if (loader.async) {
            compileResult = await loader.compile(compileData);
         } else {
            compileResult = loader.compile(compileData);
         }

         // Ready content for next loader
         loadedContent = compileResult.content;

         /** @todo this might be wrong */
         // Merge source map
         if (!loadedMap) {
            loadedMap = compileResult.map;
         } else if (loadedMap && compileResult.map) {
            loadedMap = mergeSourceMaps(loadedMap, compileResult.map);
         }

         // Chunks
         const chunkCollection = compileResult.chunks
            ? Object.entries(compileResult.chunks)
            : [];

         for (const [lang, chunks] of chunkCollection) {
            const dummyChunkSource = source + "." + lang;
            for (const chunk of chunks) {
               await loadRecursively(
                  dummyChunkSource,
                  chunk.content,
                  chunk.map
               );
            }
         }
      }

      // Add to result
      if (this.hasExtension("script", source)) {
         loadedAssetResult.scripts.push({
            source: createChunkSource(
               source,
               path.extname(source).replace(/^\./, ""),
               loadedAssetResult.scripts.length
            ),
            content: loadedContent,
            map: loadedMap,
         });
      } else if (this.hasExtension("style", source)) {
         loadedAssetResult.styles.push({
            source: createChunkSource(
               source,
               path.extname(source).replace(/^\./, ""),
               loadedAssetResult.styles.length
            ),
            content: loadedContent,
            map: loadedMap,
         });
      }
   };

   await loadRecursively(source, content);

   return loadedAssetResult;
}

export interface IAssetChunk {
   source: string;
   content: string;
   map?: RawSourceMap;
}
