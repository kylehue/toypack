import { PartialContext } from "../plugin/PluginManager.js";
import { Toypack } from "../Toypack.js";
import { mergeSourceMaps, isSupported, ERRORS } from "../utils";
import { Asset, ResourceAsset } from "../types";
import { shouldProduceSourceMap } from "../utils/should-produce-source-map.js";
import { RawSourceMap } from "source-map-js";
import { TextAsset, createAsset } from "../utils/create-asset.js";

export async function loadChunk(
   this: Toypack,
   rawSource: string,
   isEntry: boolean,
   { graph, importer }: PartialContext
) {
   const isVirtual = rawSource.startsWith("virtual:");
   const type = isVirtual ? "virtual" : this._getTypeFromSource(rawSource);
   if (!type) {
      throw new Error(
         `[load-chunk] Error: Couldn't determine the type of ${rawSource}`
      );
   }

   let asset = this.getAsset(rawSource);
   if (!asset && !isVirtual) {
      throw new Error(`[load-chunk] Error: ${rawSource} doesn't exist. `);
   } else if (!asset) {
      // Create temporary asset for virtual modules
      asset = this._virtualAssets.get(rawSource);
      if (!asset) {
         asset = {} as Asset;
         this._virtualAssets.set(rawSource, asset);
      }
   }

   /**
    * Module info will be repeatedly loaded by multiple plugins
    * and loaders.
    */
   const moduleInfo = getModuleInfo(type, rawSource, isEntry, asset);
   const config = this.getConfig();
   const sourceMapConfig = config.bundle.sourceMap;
   const shouldMap = shouldProduceSourceMap(rawSource, sourceMapConfig);

   const handleLoad = (loadResult: string | LoadResult) => {
      /**
       * Create the actual asset object for the virtual modules.
       * The first valid result will be the asset's content.
       */
      if (
         moduleInfo.type == "virtual" &&
         (typeof loadResult == "string" || typeof loadResult == "object") &&
         asset &&
         !asset.type
      ) {
         Object.assign(
            asset,
            createAsset(
               rawSource,
               typeof loadResult == "string" ? loadResult : loadResult.content
            )
         );
      }

      /**
       * Mutate module info so that the next loader will have the
       * previous loader's result.
       */
      if (typeof loadResult == "string") {
         moduleInfo.content = loadResult;
      } else {
         moduleInfo.content = loadResult.content;

         if (loadResult.type) {
            moduleInfo.type = loadResult.type;
         }

         if (
            shouldMap &&
            (moduleInfo.type == "script" || moduleInfo.type == "style") &&
            (loadResult.type == "script" || loadResult.type == "style")
         ) {
            if (moduleInfo.map && loadResult.map) {
               moduleInfo.map = mergeSourceMaps(moduleInfo.map, loadResult.map);
            } else if (!moduleInfo.map && loadResult.map) {
               moduleInfo.map = loadResult.map;
            }
         }
      }
   };

   // Load with plugins
   await this._pluginManager.triggerHook({
      name: "load",
      args: () => [
         {
            ...moduleInfo,
         },
      ],
      context: {
         bundler: this,
         graph,
         importer,
      },
      callback(result) {
         handleLoad(result);
      },
   });

   // Load with loaders
   const loaders = this._getLoadersFor(rawSource);
   for (const { loader, plugin } of loaders) {
      const context = this._pluginManager.createContext(
         {
            bundler: this,
            graph,
            importer,
         },
         plugin
      );

      const loaderResult = loader.compile.call(context, moduleInfo);
      if (!loaderResult) continue;
      handleLoad(loaderResult);
   }

   const sourceType = this._getTypeFromSource(rawSource);
   const isNotLoaded = !isSupported(rawSource) && !loaders.length;
   const isStillVirtual = moduleInfo.type == "virtual" && !sourceType;
   if (isNotLoaded || isStillVirtual) {
      this._trigger("onError", ERRORS.loaderNotFound(rawSource));
   }

   return getLoadResult(moduleInfo, sourceType);
}

function getModuleInfo(
   type: "script" | "style" | "resource" | "virtual",
   source: string,
   isEntry: boolean,
   asset: Asset
) {
   let moduleInfo: ModuleInfo;
   if (type == "virtual") {
      moduleInfo = {
         type: "virtual",
         source: source,
         content: null,
         isEntry,
         asset,
      };
   } else if (asset.type == "resource" && type == "resource") {
      moduleInfo = {
         type: "resource",
         source: source,
         content: asset.content,
         isEntry,
         asset,
      };
      asset.content;
   } else if (asset.type == "text" && (type == "script" || type == "style")) {
      moduleInfo = {
         type: type,
         source: source,
         content: asset.content,
         isEntry,
         asset,
      };
   } else {
      throw new Error(
         "[load-chunk] Error: Couldn't determine the type of " + source
      );
   }

   return moduleInfo;
}

function getLoadResult(
   moduleInfo: ModuleInfo,
   typeIfVirtual?: "script" | "style" | "resource" | null
): LoadChunkResult {
   if (moduleInfo.type == "script" || moduleInfo.type == "style") {
      return {
         type: moduleInfo.type,
         asset: moduleInfo.asset,
         content: moduleInfo.content,
         map: moduleInfo.map,
      };
   } else if (moduleInfo.type == "resource") {
      return {
         type: moduleInfo.type,
         asset: moduleInfo.asset,
         content: moduleInfo.content,
      };
   }

   if (!typeIfVirtual) {
      throw new Error(
         `[load-chunk] Error: Failed to load a virtual module (${moduleInfo.source}). Virtual modules should have a type of script, style, or resource.`
      );
   }

   (moduleInfo as ModuleInfo).type = typeIfVirtual; // change type
   return getLoadResult(moduleInfo, typeIfVirtual);
}

interface ModuleInfoBase {
   source: string;
   isEntry: boolean;
}

interface ModuleInfoText extends ModuleInfoBase {
   type: "script" | "style";
   content: string;
   asset: TextAsset;
   map?: RawSourceMap | null;
}

interface ModuleInfoResource extends ModuleInfoBase {
   type: "resource";
   content: Blob;
   asset: ResourceAsset;
}

interface ModuleInfoVirtual extends ModuleInfoBase {
   type: "virtual";
   content: string | Blob | null;
   asset: Asset;
   map?: RawSourceMap | null;
}

export type ModuleInfo =
   | ModuleInfoText
   | ModuleInfoResource
   | ModuleInfoVirtual;

interface LoadTextResult {
   type?: "script" | "style";
   content: string;
   map?: RawSourceMap | null;
}

interface LoadResourceResult {
   type?: "resource";
   content: Blob;
}

export type LoadResult = LoadTextResult | LoadResourceResult;

export interface LoadChunkResource {
   type: "resource";
   content: Blob;
   asset: ResourceAsset;
}

export interface LoadChunkText {
   type: "script" | "style";
   content: string;
   asset: Asset;
   map?: RawSourceMap | null;
}

export type LoadChunkResult = LoadChunkResource | LoadChunkText;
