import generateScript from "@babel/generator";
import type { ParserOptions } from "@babel/parser";
import type { Node } from "@babel/traverse";
import MapConverter from "convert-source-map";
import { CssNode, generate as generateStyle } from "css-tree";
import path from "path-browserify";
import { RawSourceMap } from "source-map-js";
import { CSSTreeGeneratedResult } from "../bundle/compile-style.js";
import { parseScriptAsset } from "../graph/parse-script-chunk.js";
import { parseStyleAsset } from "../graph/parse-style-chunk.js";
import type { Toypack } from "../types.js";
import {
   DEBUG,
   ERRORS,
   EXTENSIONS,
   getSourceMapUrl,
   mergeSourceMaps,
   parsePackageName,
   removeSourceMapUrl,
} from "../utils/index.js";
import { PackageProvider, Package } from "./index.js";
import {
   getFetchUrlFromProvider,
   getExtension,
   getType,
   resolve,
   getPackageInfoFromUrl,
   removeProviderHostFromUrl,
   getUrlFromProviderHost,
   getOptimizedPath,
} from "./utils/index.js";
import { fetchWithProviders } from "./fetch-with-providers.js";
import { fetchSourceMapInContent } from "./fetch-source-map.js";

export const _cache = new Map<
   string,
   {
      content: string;
      response: Response;
      map?: RawSourceMap | null;
   }
>();

export async function fetchPackage(
   this: Toypack,
   providers: PackageProvider[],
   name: string,
   version: string
): Promise<Package> {
   const assets = new Map<string, PackageAsset>();
   const config = this.getConfig();
   let subpath = parsePackageName(name).path;
   let provider = providers[0];
   let entryUrl = getFetchUrlFromProvider(provider, name, version);

   const inspectDependencies = (
      node: { value: string },
      url: string,
      fallbackFilename: string
   ) => {
      const optimizedPath = getOptimizedPath(
         name,
         version,
         url,
         "",
         fallbackFilename,
         provider
      );

      node.value = optimizedPath.importPath;
   };

   const recurse: (url: string) => Promise<boolean> = async (url: string) => {
      if (assets.get(url)) return false;
      const isEntry = url === entryUrl;
      const fetched = await fetchWithProviders(providers, url, name, version);

      if (!fetched) {
         assets.clear();
         this._trigger(
            "onError",
            ERRORS.any(
               `[package-manager] Error: Failed to fetch ${name}@${version} because none of the providers could fetch one of its dependencies.`
            )
         );

         return false;
      }

      const response = fetched.response;
      if (isEntry) {
         provider = fetched.provider;
         entryUrl = fetched.url;
      }

      // Is it a script or a style? (this is needed when parsing)
      const extension = getExtension(url, provider);
      const type = getType(extension, response);

      if (!type) {
         this._trigger(
            "onError",
            ERRORS.any(
               "[package-manager] Error: Couldn't determine the type of " + url
            )
         );

         return false;
      }

      const cached = _cache.get(url);
      const rawContent = cached ? cached.content : await response.text();
      let forcedVersion: string | undefined = undefined;
      if (isEntry && typeof provider.handleEntryVersion == "function") {
         forcedVersion =
            provider.handleEntryVersion({
               response,
               rawContent,
               name,
               version,
            }) || undefined;
      }

      const optimizedPath = getOptimizedPath(
         name,
         version,
         response.url,
         isEntry ? subpath : "",
         type == "script"
            ? extension == ".d.ts"
               ? "index.d.ts"
               : "index.js"
            : "index.css",
         provider,
         forcedVersion
      );

      const pkgInfo = getPackageInfoFromUrl(optimizedPath.path, provider, "");

      if (isEntry) {
         version = pkgInfo.version;
      }

      let content = "";
      let map: RawSourceMap | null = null;
      const isDts = getExtension(optimizedPath.path, provider) == ".d.ts";

      // Parse and compile
      let ast: CssNode | Node, rawDependencies: string[];
      if (type == "script") {
         const parserOptions: ParserOptions = {
            plugins: isDts ? [["typescript", { dts: true }]] : [],
         };

         const parsedScript = await parseScriptAsset.call(
            this,
            optimizedPath.path,
            rawContent,
            {
               parserOptions,
               inspectDependencies(node) {
                  const resolvedUrl = resolve(
                     node.value,
                     response.url,
                     getUrlFromProviderHost(provider)
                  );

                  inspectDependencies(
                     node,
                     resolvedUrl,
                     isDts ? "index.d.ts" : "index.js"
                  );
               },
            }
         );

         ast = parsedScript.ast;
         rawDependencies = parsedScript.dependencies;
         const generated = generateScript(parsedScript.ast, {
            sourceFileName: optimizedPath.path,
            filename: optimizedPath.path,
            sourceMaps: !!config.bundle.sourceMap,
            comments: true,
         });

         content = generated.code;
         map = generated.map as any;
      } else {
         const parsedStyle = await parseStyleAsset.call(
            this,
            optimizedPath.path,
            rawContent,
            {
               inspectDependencies(node) {
                  const resolvedUrl = resolve(
                     node.value,
                     response.url,
                     getUrlFromProviderHost(provider)
                  );
                  inspectDependencies(node, resolvedUrl, "index.css");
               },
            }
         );
         ast = parsedStyle.ast;
         rawDependencies = parsedStyle.dependencies;

         const generated = generateStyle(parsedStyle.ast, {
            sourceMap: !!config.bundle.sourceMap,
         }) as CSSTreeGeneratedResult;

         if (typeof generated == "string") {
            content = generated;
         } else {
            content = generated.css;
            map = MapConverter.fromJSON(generated.map.toString()).toObject();
         }
      }

      const asset: PackageAsset = {
         type,
         source: optimizedPath.path,
         ast,
         isEntry,
         url: response.url,
         content: removeSourceMapUrl(content),
         name: `${pkgInfo.scope ? `@${pkgInfo.scope}/` : ""}${pkgInfo.name}`,
         version: pkgInfo.version,
         subpath
      } as PackageAsset;

      assets.set(url, asset);

      if (asset.type == "script") {
         asset.dts = isDts;
      }

      // Get source map
      if (
         !!config.bundle.sourceMap &&
         config.packageManager.overrides?.sourceMap !== false
      ) {
         let sourceMap = await fetchSourceMapInContent(
            rawContent,
            url,
            provider
         );

         if (sourceMap && map) {
            asset.map = mergeSourceMaps(sourceMap, map);
         } else {
            asset.map = sourceMap || map;
         }
      }

      // Cache
      if (!cached) {
         _cache.set(url, { content: rawContent, response, map: asset.map });
      }

      // If entry and not a dts, fetch dts
      if (
         (config.packageManager.dts || name.startsWith("@types/")) &&
         isEntry &&
         asset.type == "script" &&
         !asset.dts &&
         provider.dtsHeader
      ) {
         const entryExtension = getExtension(entryUrl, provider);
         if (
            entryExtension != ".d.ts" &&
            (EXTENSIONS.script.includes(entryExtension) ||
               !EXTENSIONS.style.includes(entryExtension))
         ) {
            const dtsUrl = response.headers.get(provider.dtsHeader);
            if (dtsUrl) {
               await recurse(
                  resolve(dtsUrl, entryUrl, getUrlFromProviderHost(provider))
               );
            } else {
               DEBUG.warn(
                  this.getConfig().logLevel,
                  "[package-manager] Error: Couldn't get the declaration types for " +
                     entryUrl
               );
            }
         }
      }

      // Get dependency's dependencies recursively
      for (const depSource of rawDependencies) {
         const resolved = resolve(
            depSource,
            response.url,
            getUrlFromProviderHost(provider)
         );

         const isSuccess = await recurse(resolved);
         // break if a dependency fails
         if (!isSuccess) return false;
      }

      return true;
   };

   await recurse(entryUrl);

   const finalizedAssets: Record<string, PackageAsset> = {};
   for (const [_, asset] of assets) {
      finalizedAssets[asset.source] = asset;
   }

   return {
      name,
      version,
      assets: finalizedAssets,
   };
}

interface PackageAssetBase {
   source: string;
   url: string;
   map?: RawSourceMap | null;
   isEntry: boolean;
   content: string;
   name: string;
   version: string;
   subpath: string;
}

export interface PackageScriptAsset extends PackageAssetBase {
   type: "script";
   ast: Node;
   dts: boolean;
}

export interface PackageStyleAsset extends PackageAssetBase {
   type: "style";
   ast: CssNode;
}

export type PackageAsset = PackageScriptAsset | PackageStyleAsset;
