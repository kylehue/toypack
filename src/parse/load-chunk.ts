import { EncodedSourceMap } from "@jridgewell/gen-mapping";
import path from "path-browserify";
import { Toypack } from "../Toypack.js";
import {
   mergeSourceMaps,
   isSupported,
   ERRORS,
   shouldProduceSourceMap,
} from "../utils/index.js";
import { createAsset } from "../utils/create-asset.js";
import { Importers } from "./index.js";
import type { Asset, DependencyGraph, ResourceAsset } from "src/types";

export async function loadChunk(
   this: Toypack,
   rawSource: string,
   isEntry: boolean,
   graph: DependencyGraph,
   importers: Importers
) {
   const type = this._getTypeFromSource(rawSource);
   if (!type) {
      throw new Error(
         `[load-chunk] Error: Couldn't determine the type of ${rawSource}`
      );
   }

   const asset = this.getAsset(rawSource);
   let initialContent = asset?.content ?? null;
   const moduleInfo = createModuleInfo(
      type,
      rawSource,
      initialContent,
      isEntry
   );
   const sourceMapConfig = this.config.bundle.sourceMap;
   const shouldMap = shouldProduceSourceMap(rawSource, sourceMapConfig);

   const handleLoad = (loadResult: string | LoadResult) => {
      if (typeof loadResult == "string") {
         moduleInfo.content = loadResult;
      } else {
         loadResult.type ??= moduleInfo.type;
         moduleInfo.type = loadResult.type ?? moduleInfo.type;
         moduleInfo.content = loadResult.content ?? moduleInfo.content;

         if (
            shouldMap &&
            (moduleInfo.type == "script" || moduleInfo.type == "style") &&
            (loadResult.type == "script" || loadResult.type == "style")
         ) {
            if (moduleInfo.map && loadResult.map) {
               moduleInfo.map = mergeSourceMaps(loadResult.map, moduleInfo.map);
            } else {
               moduleInfo.map = loadResult.map || moduleInfo.map;
            }
         }
      }

      initialContent ??= moduleInfo.content;
   };

   // Load with plugins
   let isLoaded = false;
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
         isLoaded = true;
         handleLoad(result);
      },
   });

   const isNotLoaded = !isSupported(moduleInfo.source) && !isLoaded;
   if (isNotLoaded || initialContent === null) {
      this._pushToDebugger("error", ERRORS.loadFailure(rawSource));
   }

   let _asset = asset;
   if (!_asset) {
      _asset = createAsset(rawSource, initialContent ?? "");
      this._virtualAssets.set(rawSource, _asset);
   }
   return getLoadResult(moduleInfo, _asset);
}

function createModuleInfo(
   type: "script" | "style" | "resource",
   source: string,
   content: string | Blob | null,
   isEntry: boolean
) {
   const lang = path.extname(source.split("?")[0]).replace(".", "");
   const common = {
      source,
      isEntry,
      lang,
   };

   let moduleInfo: ModuleInfo;
   if (type == "resource") {
      moduleInfo = {
         ...common,
         type: "resource",
         content: content as Blob,
      };
   } else if (type == "script" || type == "style") {
      moduleInfo = {
         ...common,
         type: type,
         content: content as string,
      };
   } else {
      throw new Error(
         "[load-chunk] Error: Couldn't determine the type of " + source
      );
   }

   return moduleInfo;
}

function getLoadResult(moduleInfo: ModuleInfo, asset: Asset): LoadChunkResult {
   if (moduleInfo.type == "resource") {
      return {
         type: "resource",
         asset: asset as ResourceAsset,
         content: moduleInfo.content,
      };
   } else {
      return {
         type: moduleInfo.type,
         asset,
         content: moduleInfo.content,
         map: moduleInfo.map,
      };
   }
}

interface ModuleInfoBase {
   source: string;
   isEntry: boolean;
}

export interface ModuleInfoText extends ModuleInfoBase {
   type: "script" | "style";
   content: string;
   map?: EncodedSourceMap | null;
}

export interface ModuleInfoResource extends ModuleInfoBase {
   type: "resource";
   content: Blob;
}

export type ModuleInfo = ModuleInfoText | ModuleInfoResource;

/** Load result type for loaders */
interface LoadTextResult {
   type?: "script" | "style";
   content: string;
   map?: EncodedSourceMap | null;
}

interface LoadResourceResult {
   type?: "resource";
   content: Blob;
}

export type LoadResult = LoadTextResult | LoadResourceResult;

/** Load result type for `loadChunk` */
export interface LoadChunkResource {
   type: "resource";
   content: Blob;
   asset: ResourceAsset;
}

export interface LoadChunkText {
   type: "script" | "style";
   content: string;
   asset: Asset;
   map?: EncodedSourceMap | null;
}

export type LoadChunkResult = LoadChunkResource | LoadChunkText;
