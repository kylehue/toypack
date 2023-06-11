import { Toypack } from "../Toypack.js";
import { IParseScriptResult, parseScriptAsset } from "./parseScriptAsset.js";
import { IParseStyleResult, parseStyleAsset } from "./parseStyleAsset.js";
import { IAssetChunk, loadAsset } from "./loadAsset.js";
import { IDependencyImportParams } from "./index.js";
import { RawSourceMap } from "source-map-js";

/**
 * Loads and parses an asset.
 * @returns An object containing the dependencies and chunks.
 */
export async function parseAsset(
   this: Toypack,
   source: string,
   content: string | Blob,
   params: IDependencyImportParams
) {
   const result: IParsedAsset = {
      type: (this.hasExtension("script", source) ? "script" : "style") as
         | "script"
         | "style",
      source,
      scripts: [],
      styles: [],
      dependencies: [],
   };

   const loadedAsset = await loadAsset.call(this, source, content, params);

   // Scripts
   for (const script of loadedAsset.scripts) {
      if (typeof script.content != "string") continue;
      const { dependencies, AST } = await parseScriptAsset.call(
         this,
         script.chunkSource,
         script.content,
      );

      result.dependencies.push(...dependencies);
      result.scripts.push({
         chunkSource: script.chunkSource,
         content: script.content,
         map: script.map,
         dependencies,
         AST,
      });
   }

   // Styles
   for (const style of loadedAsset.styles) {
      if (typeof style.content != "string") continue;
      const { dependencies, AST } = await parseStyleAsset.call(
         this,
         style.chunkSource,
         style.content
      );

      result.dependencies.push(...dependencies);
      result.styles.push({
         chunkSource: style.chunkSource,
         content: style.content,
         map: style.map,
         dependencies,
         AST,
      });
   }

   return result;
}

export interface IParsedScript extends IParseScriptResult {
   chunkSource: string;
   content: string;
   map?: RawSourceMap;
}

export interface IParsedStyle extends IParseStyleResult {
   chunkSource: string;
   content: string;
   map?: RawSourceMap;
}

export interface IParsedAsset {
   type: "script" | "style";
   source: string;
   scripts: IParsedScript[];
   styles: IParsedStyle[];
   dependencies: string[];
}
