import generateScript from "@babel/generator";
import type { ParserOptions } from "@babel/parser";
import { RawSourceMap } from "source-map-js";
import { parseScriptAsset } from "../graph/parse-script-chunk.js";
import type { Toypack } from "../types.js";
import { mergeSourceMaps, parsePackageName } from "../utils/index.js";
import { PackageProvider } from "./index.js";
import {
   _cache,
   getFetchUrlFromProvider,
   getType,
   resolve,
   getUrlFromProviderHost,
   getNodeModulesPath,
   getSource,
   findDuplicateAsset,
   hasAppContent,
} from "./utils.js";
import { shouldProduceSourceMap } from "../utils/should-produce-source-map.js";
import { fetchSourceMapInContent } from "./fetch-source-map.js";
import { fetchVersion } from "./fetch-version.js";

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
      if (
         !response.ok ||
         !hasAppContent(response) ||
         (await provider.isBadResponse?.(response))
      ) {
         assets = {};
         dtsAssets = {};
         let backupProvider = providers[++providerIndex % providers.length];
         if (!provider || backupProvider === providers[0]) {
            throw new Error(
               `[package-manager] Error: Couldn't fetch '${name}@${version}${subpath}'.`
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

      const rawContent = cached ? cached.rawContent : await response.text();
      let source = getSource(name, version, subpath, url, isEntry, type);
      let content: string = rawContent;
      let dependencies: string[] = [];
      let map: any;
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
                  const resolved = resolve(
                     node.value,
                     url,
                     getUrlFromProviderHost(provider)
                  );

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
      }

      // Get source map
      if (shouldMap) {
         let sourceMap = cached
            ? cached.map
            : await fetchSourceMapInContent(rawContent, url, provider);

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
         const resolved = resolve(
            depSource,
            url,
            getUrlFromProviderHost(provider)
         );

         const isSuccess = await recurse(resolved);
         // break if a dependency fails
         if (!isSuccess) return false;
      }

      // Cache
      if (!cached) {
         _cache.set(url, {
            rawContent: rawContent,
            response,
            map: asset.map,
            asset,
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
   map?: RawSourceMap | null;
   isEntry: boolean;
   content: string;
}

export interface PackageScriptAsset extends PackageAssetBase {
   type: "script";
   dts: boolean;
}

export interface PackageStyleAsset extends PackageAssetBase {
   type: "style";
}

export type PackageAsset = PackageScriptAsset | PackageStyleAsset;
