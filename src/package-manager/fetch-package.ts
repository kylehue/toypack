import generateScript from "@babel/generator";
import { generate as generateStyle } from "css-tree";
import type { ParserOptions } from "@babel/parser";
import { RawSourceMap } from "source-map-js";
import MapConverter from "convert-source-map";
import { parseScriptAsset } from "../graph/parse-script-chunk.js";
import type { Toypack } from "../types.js";
import {
   mergeSourceMaps,
   parsePackageName,
   shouldProduceSourceMap,
} from "../utils";
import { PackageProvider } from "./index.js";
import {
   _cache,
   getFetchUrlFromProvider,
   getType,
   resolve,
   getNodeModulesPath,
   getSource,
   findDuplicateAsset,
} from "./utils.js";
import { fetchSourceMapInContent } from "./fetch-source-map.js";
import { fetchVersion } from "./fetch-version.js";
import { parseStyleAsset } from "../graph/parse-style-chunk.js";
import { CSSTreeGeneratedResult } from "../bundle/compile-style.js";

export async function fetchPackage(
   bundler: Toypack,
   providers: PackageProvider[],
   packagePath: string,
   packageVersion: string = "latest"
) {
   const config = bundler.getConfig();
   const sourceMapConfig = config.bundle.sourceMap;
   let providerIndex = 0;
   let provider = providers[providerIndex];
   let assets: Record<string, PackageAsset> = {};
   let dtsAssets: Record<string, PackageAsset> = {};
   let { name, subpath } = parsePackageName(packagePath);
   let version = await fetchVersion(name, packageVersion);

   let entryUrl = getFetchUrlFromProvider(provider, name, version, subpath);

   const recurse = async (url: string) => {
      if (url in assets || url in dtsAssets) return false;
      const isEntry = entryUrl == url;

      // Dedupe
      const duplicateAsset = findDuplicateAsset(
         url,
         config.packageManager.dedupe || []
      );
      if (duplicateAsset) {
         const asset: PackageAsset = {
            type: "script",
            url,
            isEntry,
            source: getSource(name, version, subpath, url, isEntry, "script"),
            content:
               `export * from "${duplicateAsset.source}";\n` +
               `export { default } from "${duplicateAsset.source}";`,
            dts: false,
         };

         assets[url] = asset;
         return true;
      }

      const cached = _cache.get(url);
      const response = cached ? cached.response : await fetch(url);
      url = response.url;

      // Use backup providers when response is bad
      if (!response.ok || (await provider.isBadResponse?.(response))) {
         assets = {};
         dtsAssets = {};
         let backupProvider = providers[++providerIndex % providers.length];
         if (!provider || backupProvider === providers[0]) {
            throw new Error(
               `[package-manager] Error: Couldn't fetch '${url}'.`
            );
         } else {
            provider = backupProvider;
            entryUrl = getFetchUrlFromProvider(
               provider,
               name,
               version,
               subpath
            );

            await recurse(entryUrl);
         }

         return false;
      }

      const type = getType(response);
      if (!type) {
         throw new Error(
            `[package-manager] Error: Couldn't determine the type of ${url}`
         );
      }

      let source = getSource(name, version, subpath, url, isEntry, type);

      if (type == "resource") {
         const content =
            cached?.type == "resource"
               ? cached.rawContent
               : await response.blob();
         const asset: PackageResourceAsset = {
            type: "resource",
            url,
            source,
            content,
            isEntry,
         };

         assets[url] = asset;

         // Cache resource
         if (!cached) {
            _cache.set(url, {
               type: "resource",
               rawContent: content,
               response,
               asset,
            });
         }

         // We don't need to parse the resource so we return
         // Return true to continue scanning other sibling deps
         return true;
      }

      const rawContent =
         typeof cached?.rawContent == "string"
            ? cached.rawContent
            : await response.text();
      let content: string = rawContent;
      let dependencies: string[] = [];
      let map: RawSourceMap | null | undefined = null;
      const shouldMap = shouldProduceSourceMap(source, sourceMapConfig);

      // Parse, get dependencies, and recompile
      if (type == "script") {
         const parserOptions: ParserOptions = {
            //plugins: isDts ? [["typescript", { dts: true }]] : [],
         };

         const parsedScript = await parseScriptAsset.call(
            bundler,
            source,
            rawContent,
            {
               parserOptions,
               inspectDependencies(node) {
                  const resolved = resolve(node.value, url);

                  node.value = getNodeModulesPath(resolved, name, version);
               },
            }
         );

         dependencies = parsedScript.dependencies;

         const generated = generateScript(parsedScript.ast, {
            sourceFileName: source,
            filename: source,
            sourceMaps: shouldMap,
            comments: false,
         });

         content = generated.code;
         map = generated.map as any;
      } else {
         const parsedStyle = await parseStyleAsset.call(
            bundler,
            source,
            rawContent,
            {
               inspectDependencies(node) {
                  const resolved = resolve(node.value, url);

                  node.value = getNodeModulesPath(resolved, name, version);
               },
            }
         );

         dependencies = parsedStyle.dependencies;

         const generated = generateStyle(parsedStyle.ast, {
            sourceMap: shouldMap,
         }) as any as CSSTreeGeneratedResult;

         if (typeof generated == "string") {
            content = generated;
         } else {
            content = generated.css;
            map = MapConverter.fromJSON(generated.map.toString()).toObject();
         }
      }

      // Get source map
      if (shouldMap) {
         let sourceMap =
            cached && cached.type != "resource"
               ? cached.map
               : await fetchSourceMapInContent(rawContent, url);

         if (sourceMap && map) {
            map = mergeSourceMaps(sourceMap, map);
         } else {
            map = sourceMap || map;
         }
      }

      const asset: PackageAsset = {
         type,
         url,
         source,
         content,
         map,
         isEntry,
      } as PackageAsset;

      assets[url] = asset;

      // Fetch dependencies recursively
      for (const depSource of dependencies) {
         const resolved = resolve(depSource, url);

         const isSuccess = await recurse(resolved);
         // break if a dependency fails
         if (!isSuccess) return false;
      }

      // Cache
      if (!cached && asset.type != "resource") {
         _cache.set(url, {
            type,
            rawContent: rawContent,
            response,
            asset,
            map: asset.map,
         });
      }

      return true;
   };

   await recurse(entryUrl);

   return { name, version, subpath, assets, dtsAssets };
}

export interface Package {
   name: string;
   version: string;
   assets: Record<string, PackageAsset>;
}

interface PackageAssetBase {
   source: string;
   url: string;
   isEntry: boolean;
}

export interface PackageScriptAsset extends PackageAssetBase {
   type: "script";
   dts: boolean;
   map?: RawSourceMap | null;
   content: string;
}

export interface PackageStyleAsset extends PackageAssetBase {
   type: "style";
   map?: RawSourceMap | null;
   content: string;
}

export interface PackageResourceAsset extends PackageAssetBase {
   type: "resource";
   content: Blob;
}

export type PackageAsset =
   | PackageScriptAsset
   | PackageStyleAsset
   | PackageResourceAsset;
