import { Toypack } from "../Toypack.js";
import { IParseScriptResult, parseScriptAsset } from "./parseScriptAsset.js";
import { IParseStyleResult, parseStyleAsset } from "./parseStyleAsset.js";
import { IAssetChunk, loadAsset } from "./loadAsset.js";
import { IDependencyImportParams } from "./index.js";

/**
 * Loads and parses an asset.
 * @returns An object containing the dependencies and chunks.
 */
export async function parseAsset(
   this: Toypack,
   source: string,
   content: string,
   params: IDependencyImportParams
) {
   const result = {
      type: this.hasExtension("script", source)
         ? "script"
         : ("style" as "script" | "style"),
      source,
      scripts: [] as IParsedScript[],
      styles: [] as IParsedStyle[],
      dependencies: [] as string[],
   };

   const loadedAsset = await loadAsset.call(this, source, content, params);

   // Scripts
   for (const script of loadedAsset.scripts) {
      const parsedScript = await parseScriptAsset.call(
         this,
         script.source,
         script.content
      );

      result.dependencies.push(...parsedScript.dependencies);
      result.scripts.push({
         ...parsedScript,
         source: script.source,
         content: script.content,
         map: script.map,
      });
   }

   // Styles
   for (const script of loadedAsset.styles) {
      const parsedStyle = await parseStyleAsset.call(
         this,
         script.source,
         script.content
      );

      result.dependencies.push(...parsedStyle.dependencies);
      result.styles.push({
         ...parsedStyle,
         source: script.source,
         content: script.content,
         map: script.map,
      });
   }

   return result;
}

export type IParsedScript = IParseScriptResult & IAssetChunk;
export type IParsedStyle = IParseStyleResult & IAssetChunk;
