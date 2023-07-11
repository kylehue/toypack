import generateScript from "@babel/generator";
import { generate as generateStyle } from "css-tree";
import type { ParserOptions } from "@babel/parser";
import { EncodedSourceMap } from "@jridgewell/gen-mapping";
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
   getMimeType,
} from "./utils.js";
import { fetchSourceMapInContent } from "./fetch-source-map.js";
import { fetchVersion } from "./fetch-version.js";
import { parseStyleAsset } from "../graph/parse-style-chunk.js";
import { CSSTreeGeneratedResult } from "../bundle/compile-style.js";

function getDtsHeader(
   optionDtsHeader: PackageProvider["dtsHeader"],
   name: string,
   version: string,
   subpath: string
) {
   if (!optionDtsHeader) return;
   if (typeof optionDtsHeader == "string") return optionDtsHeader;
   return optionDtsHeader({ name, version, subpath });
}

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
   packageVersion = await fetchVersion(name, packageVersion);
   let isDtsEntry = packagePath.startsWith("@types/");
   let entryUrl = getFetchUrlFromProvider(
      provider,
      name,
      packageVersion,
      subpath
   );

   const recurse = async (url: string, isDts = false) => {
      if (url in assets || url in dtsAssets) return true;
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
            source: getSource(
               name,
               packageVersion,
               subpath,
               url,
               isEntry,
               "script",
               isDts
            ),
            content:
               `export * from "${duplicateAsset.source}";\n` +
               `export { default } from "${duplicateAsset.source}";`,
            dts: false,
         };

         assets[url] = asset;
         return true;
      }

      const cached = _cache.get(url);
      let response = cached ? cached.response : await fetch(url);
      url = response.url;

      // Use backup providers when response is bad
      if (!response.ok || (await provider.isBadResponse?.(response))) {
         // no need to reset if it's just a dts asset
         if (!isDts) {
            assets = {};
            dtsAssets = {};
         }
         
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
               packageVersion,
               subpath
            );

            await recurse(entryUrl);
         }

         return false;
      }

      /**
       * If we're looking for a dts file but the response's content
       * isn't typescript, we should change the response by fetching
       * the url in provider's `dtsHeader`.
       * 
       * This is for providers like skypack that stores the @types/...
       * types in dts header instead of storing it in the response's
       * content itself (like esm.sh).
       */
      if (
         isDts &&
         getMimeType(response) != "application/typescript" &&
         provider.dtsHeader
      ) {
         const dtsHeader = getDtsHeader(
            provider.dtsHeader,
            name,
            packageVersion,
            subpath
         );
         const dtsUrl = response.headers.get(dtsHeader || "");
         if (dtsUrl) {
            response = await fetch(resolve(dtsUrl, url));
            url = response.url;
         }
      }

      const type = getType(response);
      if (!type) {
         throw new Error(
            `[package-manager] Error: Couldn't determine the type of ${url}`
         );
      }

      let source = getSource(
         name,
         packageVersion,
         subpath,
         url,
         isEntry,
         type,
         isDts
      );

      if (type == "resource") {
         const content =
            cached?.type == "resource"
               ? cached.rawContent
               : await response.blob();
         const asset = createPackageAsset(
            "resource",
            source,
            content,
            url,
            isEntry
         );

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
      let map: EncodedSourceMap | null | undefined = null;
      const shouldMap = shouldProduceSourceMap(source, sourceMapConfig);

      // Parse, get dependencies, and recompile
      if (type == "script") {
         const parserOptions: ParserOptions = {
            plugins: isDts ? [["typescript", { dts: true }]] : [],
         };

         const parsedScript = await parseScriptAsset.call(
            bundler,
            source,
            rawContent,
            {
               parserOptions,
               inspectDependencies(node) {
                  const resolved = resolve(node.value, url);

                  node.value = getNodeModulesPath(
                     resolved,
                     name,
                     packageVersion
                  );
               },
            }
         );

         dependencies = parsedScript.dependencies;

         if (isDts) {
            // skip non-dts deps
            dependencies = dependencies.filter((d) => d.endsWith(".d.ts"));
         }

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

                  node.value = getNodeModulesPath(
                     resolved,
                     name,
                     packageVersion
                  );
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
      if (shouldMap && !isDts) {
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

      // Get dts
      if (config.packageManager.dts && isEntry && provider.dtsHeader) {
         const dtsHeader = getDtsHeader(
            provider.dtsHeader,
            name,
            packageVersion,
            subpath
         );
         const dtsUrl = response.headers.get(dtsHeader || "");
         if (dtsUrl) {
            recurse(resolve(dtsUrl, url), true);
         }
      }

      const asset = createPackageAsset(
         type,
         source,
         content,
         url,
         isEntry,
         map,
         isDts
      );

      if (asset.type == "script" && asset.dts) {
         dtsAssets[url] = asset;
         config.packageManager.onDts?.({
            source: asset.source,
            content: asset.content,
            packagePath,
            packageVersion,
         });
      } else {
         assets[url] = asset;
      }

      // Fetch dependencies recursively
      for (const depSource of dependencies) {
         const resolved = resolve(depSource, url);

         const isSuccess = await recurse(resolved, isDts);
         // break if a dependency fails
         if (!isSuccess) return false;
      }

      // Cache
      if (!cached) {
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

   await recurse(entryUrl, isDtsEntry);

   return { name, version: packageVersion, subpath, assets, dtsAssets };
}

function createPackageAsset<
   T extends "script" | "style" | "resource",
   U extends T extends "script"
      ? PackageScriptAsset
      : T extends "style"
      ? PackageStyleAsset
      : T extends "resource"
      ? PackageResourceAsset
      : PackageAsset
>(
   type: T,
   source: string,
   content: T extends "resource" ? Blob : string,
   url: string,
   isEntry: boolean,
   map: EncodedSourceMap | null = null,
   isDts = false
): U {
   const common = {
      source,
      url,
      isEntry,
   };

   let asset: PackageAsset;
   if (type == "resource") {
      asset = {
         ...common,
         type: "resource",
         content: content as Blob,
      };
   } else if (type == "style") {
      asset = {
         ...common,
         type: "style",
         content: content as string,
         map,
      };
   } else {
      asset = {
         ...common,
         type: "script",
         content: content as string,
         map,
         dts: isDts,
      };
   }

   return asset as U;
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
   map?: EncodedSourceMap | null;
   content: string;
}

export interface PackageStyleAsset extends PackageAssetBase {
   type: "style";
   map?: EncodedSourceMap | null;
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
