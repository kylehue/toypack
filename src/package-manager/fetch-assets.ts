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
import type { Toypack } from "../types";
import {
   ERRORS,
   EXTENSIONS,
   getSourceMapUrl,
   mergeSourceMaps,
   parsePackageName,
   removeSourceMapUrl,
} from "../utils";
import { PackageProviderConfig, Package } from ".";
import {
   getFetchUrlFromProvider,
   getExtension,
   getType,
   resolve,
   getPackageInfoFromUrl,
   removeProviderHostFromUrl,
   getUrlFromProviderHost,
   getOptimizedPath,
} from "./utils.js";

const cache = new Map<
   string,
   {
      content: string;
      response: Response;
      map?: RawSourceMap | null;
   }
>();

const badProvidersUrlMap: Record<string, string[]> = {};

export async function fetchAssets(
   this: Toypack,
   providers: PackageProviderConfig[],
   name: string,
   version: string
) {
   let currentProviderIndex = 0;
   let provider = providers[currentProviderIndex];
   const assets = new Map<string, PackageAsset>();
   const config = this.getConfig();
   const subpath = parsePackageName(name).path;
   const entryUrl = getFetchUrlFromProvider(provider, name, version);
   let entryResponse: Response = {} as Response;

   const inspectDependencies = (
      node: { value: string },
      url: string,
      fallbackFilename: string
   ) => {
      const optimizedPath = getOptimizedPath(
         url,
         subpath,
         fallbackFilename,
         version,
         provider
      );

      node.value = optimizedPath.importPath;
   };

   const recurse = async (url: string) => {
      if (assets.get(url)) return false;

      const cached = cache.get(url);
      const response = cached ? cached.response : await fetch(url);

      // Use backup providers if the current provider can't fetch the url
      const urlIsBadForProvider =
         badProvidersUrlMap[provider.host]?.includes(url);
      if (
         !response.ok ||
         urlIsBadForProvider ||
         (await provider.isBadResponse?.(response, { name, version }))
      ) {
         if (!urlIsBadForProvider) {
            badProvidersUrlMap[provider.host] ??= [];
            badProvidersUrlMap[provider.host].push(url);
         }

         let backupProvider =
            providers[++currentProviderIndex % providers.length];
         let isOutOfProviders = false;
         while (badProvidersUrlMap[backupProvider.host]?.includes(url)) {
            backupProvider =
               providers[++currentProviderIndex % providers.length];

            if (backupProvider == provider) {
               isOutOfProviders = true;
               break;
            }
         }

         const pkgPath = getPackageInfoFromUrl(url).fullPath;
         if (backupProvider == provider || isOutOfProviders) {
            assets.clear();
            this._trigger(
               "onError",
               ERRORS.any(
                  `[package-manager] Error: Failed to fetch ${name}@${version} because none of the providers could fetch one of its dependencies which is ${pkgPath}.`
               )
            );
            return false;
         }

         if (backupProvider && backupProvider != provider) {
            provider = backupProvider;
            const newUrl = getFetchUrlFromProvider(provider, pkgPath);
            await recurse(newUrl);
         }

         return false;
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

      const optimizedPath = getOptimizedPath(
         url,
         subpath,
         type == "script" ? "index.js" : "index.css",
         version,
         provider
      );

      const rawContent = cached ? cached.content : await response.text();
      let content = "";
      let map: RawSourceMap | null = null;

      // Parse
      let ast: CssNode | Node, rawDependencies: string[];
      if (type == "script") {
         const parserOptions: ParserOptions = {
            plugins:
               extension == ".d.ts" ? [["typescript", { dts: true }]] : [],
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
                     url,
                     getUrlFromProviderHost(provider)
                  );
                  inspectDependencies(node, resolvedUrl, "index.js");
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
                     url,
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

      const isEntry = url === entryUrl;

      if (isEntry) {
         entryResponse = response;
      }

      const asset: PackageAsset = {
         type,
         source: optimizedPath.path,
         ast,
         isEntry,
         url,
         content,
      } as PackageAsset;

      assets.set(url, asset);

      if (asset.type == "script") {
         asset.dts = extension == ".d.ts" ? true : false;
      }

      // Get dependency's dependencies by recursing
      for (const depSource of rawDependencies) {
         const resolved = resolve(
            depSource,
            url,
            getUrlFromProviderHost(provider)
         );

         const isSuccess = await recurse(resolved);
         if (!isSuccess) return false;
      }

      asset.content = removeSourceMapUrl(asset.content);

      // Get source map
      if (
         !!config.bundle.sourceMap &&
         config.packageManager.overrides?.sourceMap
      ) {
         let sourceMap: RawSourceMap | null = null;
         if (cached?.map) {
            sourceMap = cached.map;
         } else {
            const sourceMapUrl = getSourceMapUrl(rawContent);
            if (sourceMapUrl) {
               const resolvedMapUrl = resolve(
                  sourceMapUrl,
                  url,
                  getUrlFromProviderHost(provider)
               );
               const mapResponse = await fetch(resolvedMapUrl);
               if (mapResponse) {
                  sourceMap = await mapResponse.json();
               }
            }
         }

         if (sourceMap && map) {
            asset.map = mergeSourceMaps(sourceMap, map);
         } else {
            asset.map = sourceMap || map;
         }
      }

      // Cache
      if (!cached) {
         cache.set(url, { content: rawContent, response, map: asset.map });
      }

      return true;
   };

   await recurse(entryUrl);

   // // Get dts files
   // if (
   //    config.packageManager.dts &&
   //    typeof provider.dtsHeader == "string" &&
   //    entryResponse.ok
   // ) {
   //    const entryExtension = getExtension(entryUrl, provider);
   //    if (
   //       entryExtension != ".d.ts" &&
   //       (EXTENSIONS.script.includes(entryExtension) ||
   //          !EXTENSIONS.style.includes(entryExtension))
   //    ) {
   //       const dtsUrl = entryResponse.headers.get(provider.dtsHeader);
   //       if (dtsUrl) {
   //          await recurse(
   //             resolve(dtsUrl, entryUrl, getUrlFromProviderHost(provider))
   //          );
   //       } else {
   //          this._trigger(
   //             "onError",
   //             ERRORS.any(
   //                "[package-manager] Error: Couldn't get the declaration types for " +
   //                   entryUrl
   //             )
   //          );
   //       }
   //    }
   // }

   const finalizedAssets: Record<string, PackageAsset> = {};

   for (const [_, asset] of assets) {
      finalizedAssets[asset.source] = asset;
   }

   console.log(finalizedAssets);

   return finalizedAssets;
}

interface PackageAssetBase {
   source: string;
   url: string;
   map?: RawSourceMap | null;
   isEntry: boolean;
   content: string;
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
