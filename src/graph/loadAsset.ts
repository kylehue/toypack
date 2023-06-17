import path from "path-browserify";
import { RawSourceMap } from "source-map-js";
import { loaderNotFoundError } from "../errors.js";
import { ILoaderData, Toypack } from "../Toypack.js";
import { supportedExtensions } from "../extensions.js";
import { mergeSourceMaps, parseURL } from "../utils.js";

function filterLoaders(
   loaders: ILoaderData[],
   source: string | ReturnType<typeof parseURL>
) {
   let parsedSource;
   if (typeof source == "string") {
      parsedSource = parseURL(source);
   } else {
      parsedSource = source;
   }

   const result: ILoaderData[] = [];
   for (const loader of loaders) {
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
         result.push(loader);
         if (loader.chaining === false) break;
      }
   }

   return result;
}

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
      sourceToAdd: string | ReturnType<typeof parseURL>,
      contentToAdd: string | Blob,
      map?: RawSourceMap,
      chainedExtension = ""
   ) => {
      let parsedSource;
      if (typeof sourceToAdd == "string") {
         parsedSource = parseURL(sourceToAdd);
      } else {
         parsedSource = sourceToAdd;
      }

      // Determine which group it belongs to
      let groupKey: "scripts" | "styles" | null = null;
      if (this.hasExtension("script", parsedSource.target)) {
         groupKey = "scripts";
      } else if (this.hasExtension("style", parsedSource.target)) {
         groupKey = "styles";
      }

      if (groupKey) {
         let chunkSource = parsedSource.target + parsedSource.query;
         const group = loadedAssetResult[groupKey];

         // Avoid chunk source collision by indexing
         if (group.length >= 1) {
            const extname = path.extname(parsedSource.target);
            chunkSource = parsedSource.target.replace(
               new RegExp(extname + "$", "gi"),
               ""
            );
            chunkSource += "-" + group.length + extname + parsedSource.query;
         }

         // Add
         group.push({
            chunkSource: chunkSource,
            content: contentToAdd,
            map,
            chainedExtension
         });
      }
   };

   const loadRecursively = async (
      rawSource: string,
      contentToLoad: string | Blob,
      map?: RawSourceMap,
      chainedExtension = ""
   ) => {
      const parsedSource = parseURL(rawSource);
      const loaders = filterLoaders(this.loaders, parsedSource);
      const isSupported = supportedExtensions.includes(
         path.extname(parsedSource.target)
      );

      // If no loader found and not supported, throw an error
      if (!loaders.length && !isSupported) {
         this.hooks.trigger(
            "onError",
            loaderNotFoundError(parsedSource.target)
         );
         return;
      }

      // If no loader found but is already supported, just add
      if (!loaders.length && isSupported) {
         addToResult(parsedSource, contentToLoad, map, chainedExtension);
         return;
      }

      // Load content with each of the loaders
      for (let i = loaders.length - 1; i >= 0; i--) {
         const loader = loaders[i];
         const compiledChunks = await loader.compile({
            source: parsedSource.target,
            content: contentToLoad,
            params: parsedSource.params,
         });

         // Load chunks recursively until it becomes supported
         for (const [lang, chunks] of Object.entries(compiledChunks)) {
            if (!chunks.length) break;
            const chunkSource =
               parsedSource.target + "." + lang + parsedSource.query;
            for (const chunk of chunks) {
               const chunkSourceMap =
                  map && chunk.map
                     ? mergeSourceMaps(map, chunk.map)
                     : chunk.map;

               // Test lang if it's already supported
               // If it's already supported, then we don't need to recurse
               const isAlreadySupported = supportedExtensions.includes(
                  "." + lang
               );
               if (isAlreadySupported) {
                  addToResult(
                     chunkSource,
                     chunk.content,
                     chunkSourceMap,
                     chainedExtension + "." + lang
                  );
               } else {
                  await loadRecursively(
                     chunkSource,
                     chunk.content,
                     chunkSourceMap,
                     chainedExtension + "." + lang
                  );
               }
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
   chainedExtension: string;
}
