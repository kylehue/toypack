import path from "path-browserify";
import { RawSourceMap } from "source-map-js";
import { loaderNotFoundError } from "../errors.js";
import { ILoaderData, Toypack } from "../Toypack.js";
import { supportedExtensions } from "../extensions.js";
import { createChunkSource, mergeSourceMaps } from "../utils.js";
import { IDependencyImportParams } from "./index.js";

function getImportCode(this: Toypack, source: string, isCSS: boolean) {
   const moduleType = this.options.bundleOptions.moduleType;
   if (isCSS) return `@import "${source}";\n`;
   return moduleType == "esm"
      ? `import "${source}";\n`
      : `require("${source}");\n`;
}

/**
 * Loads an asset's content using loaders.
 * @returns The chunks of the asset. The first item in the scripts/styles
 * array is the asset's entry.
 */
export async function loadAsset(
   this: Toypack,
   source: string,
   content: string | Blob,
   params: IDependencyImportParams = {}
) {
   const loadedAssetResult = {
      scripts: [] as IAssetChunk[],
      styles: [] as IAssetChunk[],
   };

   const addToResult = (
      source: string,
      content: string | Blob,
      map?: RawSourceMap
   ) => {
      let key: "scripts" | "styles" | null = null;
      if (this.hasExtension("script", source)) {
         key = "scripts";
      } else if (this.hasExtension("style", source)) {
         key = "styles";
      }

      if (key) {
         const group = loadedAssetResult[key];
         const chunkSource = createChunkSource(
            source,
            path.extname(source).replace(/^\./, ""),
            group.length
         );
         group.push({
            chunkSource: chunkSource,
            content: content,
            map,
         });

         /* if (group.length > 1) {
            group[0].content =
               getImportCode.call(this, chunkSource, key == "styles") +
               group[0].content;
         } */
      }
   };

   const loadRecursively = async (
      source: string,
      content: string | Blob,
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
      let loadedSource = source;
      let loadedContent = content;
      let loadedMap = map;
      for (let i = loaders.length - 1; i >= 0; i--) {
         const loader = loaders[i];
         const compileResult = await loader.compile({
            content: loadedContent,
            params,
            source,
         });

         const mainChunk = compileResult.contents[compileResult.mainLang][0];
         // Ready content for next loader
         loadedContent = mainChunk.content;
         loadedSource += "." + compileResult.mainLang;

         /** @todo this might be wrong */
         // Merge source map
         if (!loadedMap) {
            loadedMap = mainChunk.map;
         } else if (loadedMap && mainChunk.map) {
            loadedMap = mergeSourceMaps(loadedMap, mainChunk.map);
         }

         // Chunks
         const chunkCollection = compileResult.contents
            ? Object.entries(compileResult.contents)
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

      addToResult(source, loadedContent, loadedMap);
   };

   await loadRecursively(source, content);

   return loadedAssetResult;
}

export interface IAssetChunk {
   chunkSource: string;
   content: string | Blob;
   map?: RawSourceMap;
}
