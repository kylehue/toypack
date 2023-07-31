import { Toypack } from "../Toypack.js";
import {
   mergeSourceMaps,
   isSupported,
   ERRORS,
   shouldProduceSourceMap,
} from "../utils/index.js";
import {
   Asset,
   DependencyGraph,
   ResourceAsset,
   TextAsset,
} from "../types.js";
import { EncodedSourceMap } from "@jridgewell/gen-mapping";
import { createAsset } from "../utils/create-asset.js";
import path from "path-browserify";
import { Importers } from "./index.js";

export async function loadChunk(
   this: Toypack,
   rawSource: string,
   isEntry: boolean,
   graph: DependencyGraph,
   importers: Importers
) {
   const isVirtual = rawSource.startsWith("virtual:");
   let type: InitialModuleType | null = isVirtual
      ? "virtual"
      : this._getTypeFromSource(rawSource);
   if (!type) {
      throw new Error(
         `[load-chunk] Error: Couldn't determine the type of ${rawSource}`
      );
   }

   let asset = this.getAsset(rawSource);
   if (!asset && !isVirtual) {
      throw new Error(`[load-chunk] Error: ${rawSource} doesn't exist.`);
   } else if (!asset) {
      // Create temporary asset for virtual modules
      asset = this._virtualAssets.get(rawSource) || null;
      if (!asset) {
         asset = {} as Asset;
         this._virtualAssets.set(rawSource, asset);
      }
   }

   if (asset.forceContentTypeAs) {
      type = asset.forceContentTypeAs;
   }

   const lang = path.extname(rawSource.split("?")[0]).replace(".", "");
   const moduleInfo = getModuleInfo(type, rawSource, isEntry, asset, lang);
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

         moduleInfo.type = loadResult.type || moduleInfo.type;

         if (loadResult.type == "script" || loadResult.type == "style") {
            moduleInfo.lang = loadResult.lang || moduleInfo.lang;
         }

         if (
            shouldMap &&
            (moduleInfo.type == "script" || moduleInfo.type == "style") &&
            (loadResult.type == "script" || loadResult.type == "style")
         ) {
            if (moduleInfo.map && loadResult.map) {
               moduleInfo.map = mergeSourceMaps(moduleInfo.map, loadResult.map);
            } else {
               moduleInfo.map ||= loadResult.map;
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
         graph,
         importers,
         source: rawSource,
      },
      callback(result) {
         handleLoad(result);
      },
   });

   // Load with loaders
   const formattedSource = appendLangToRawSource(rawSource, moduleInfo);
   let isLoaded = false;
   await this._pluginManager.useLoaders(
      formattedSource,
      graph,
      importers,
      moduleInfo,
      (result) => {
         isLoaded = true;
         handleLoad(result);
      }
   );

   const sourceType = this._getTypeFromSource(formattedSource);
   const isNotLoaded = !isSupported(formattedSource) && !isLoaded;
   const isStillVirtual = moduleInfo.type == "virtual" && !sourceType;
   if (isNotLoaded || isStillVirtual) {
      this._pushToDebugger(
         "error",
         ERRORS.loadFailure(
            rawSource,
            moduleInfo.type != "resource" ? moduleInfo.lang : undefined
         )
      );
   }

   return getLoadResult(moduleInfo, sourceType);
}

function appendLangToRawSource(rawSource: string, moduleInfo: ModuleInfo) {
   if (moduleInfo.type == "resource") return rawSource;
   if (!moduleInfo.lang) return rawSource;
   const [source, query] = rawSource.split("?");
   return moduleInfo.lang ? `${source}.${moduleInfo.lang}?${query}` : rawSource;
}

function getModuleInfo(
   type: "script" | "style" | "resource" | "virtual",
   source: string,
   isEntry: boolean,
   asset: Asset,
   lang: string
) {
   const common = {
      source,
      isEntry,
      lang,
   };

   let moduleInfo: ModuleInfo;
   if (type == "virtual") {
      moduleInfo = {
         ...common,
         type: "virtual",
         content: null,
         asset,
      };
   } else if (asset.type == "resource" && type == "resource") {
      moduleInfo = {
         ...common,
         type: "resource",
         content: asset.content,
         asset,
      };
   } else if (asset.type == "text" && (type == "script" || type == "style")) {
      moduleInfo = {
         ...common,
         type: type,
         content: asset.content,
         asset,
      };
   } else {
      throw new Error(
         "[load-chunk] Error: Couldn't determine the type of " + asset.source
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
         lang: moduleInfo.lang,
      };
   } else if (moduleInfo.type == "resource") {
      return {
         type: moduleInfo.type,
         asset: moduleInfo.asset,
         content: moduleInfo.content,
         lang: moduleInfo.lang,
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

type InitialModuleType = "script" | "style" | "resource" | "virtual";

interface ModuleInfoBase {
   source: string;
   isEntry: boolean;
   asset: Asset;
}

export interface ModuleInfoText extends ModuleInfoBase {
   type: "script" | "style";
   content: string;
   asset: TextAsset;
   map?: EncodedSourceMap | null;
   lang: string;
}

export interface ModuleInfoResource extends ModuleInfoBase {
   type: "resource";
   content: Blob;
   asset: ResourceAsset;
   lang: string;
}

export interface ModuleInfoVirtual extends ModuleInfoBase {
   type: "virtual";
   content: string | Blob | null;
   asset: Asset;
   map?: EncodedSourceMap | null;
   lang: string;
}

export type ModuleInfo =
   | ModuleInfoText
   | ModuleInfoResource
   | ModuleInfoVirtual;

/** Load result type for loaders */
interface LoadResultBase {
   lang?: string;
}

interface LoadTextResult extends LoadResultBase {
   type?: "script" | "style";
   content: string;
   map?: EncodedSourceMap | null;
}

interface LoadResourceResult extends LoadResultBase {
   type?: "resource";
   content: Blob;
}

export type LoadResult = LoadTextResult | LoadResourceResult;

/** Load result type for `loadChunk` */
export interface LoadChunkResource {
   type: "resource";
   content: Blob;
   asset: ResourceAsset;
   lang: string;
}

export interface LoadChunkText {
   type: "script" | "style";
   content: string;
   asset: Asset;
   map?: EncodedSourceMap | null;
   lang: string;
}

export type LoadChunkResult = LoadChunkResource | LoadChunkText;