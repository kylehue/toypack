import { EncodedSourceMap } from "@jridgewell/gen-mapping";
import MapConverter from "convert-source-map";
import generateScript from "@babel/generator";
import { generate as generateStyle } from "css-tree";
import { resolve, getType } from "../package-manager/utils";
import { Plugin, Toypack } from "../types.js";
import { isUrl, mergeSourceMaps } from "../utils";
import { parseScriptAsset } from "../parse/parse-script-chunk.js";
import { parseStyleAsset } from "../parse/parse-style-chunk.js";
import { CSSTreeGeneratedResult } from "../bundle-style/compile-style.js";
import { fetchSourceMapInContent } from "../package-manager/fetch-source-map";
interface ExternalAssetBase {
   url: string;
   source: string;
   lang?: string;
}
interface ExternalScriptAsset extends ExternalAssetBase {
   type: "script";
   content: string;
   map?: EncodedSourceMap | null;
}

interface ExternalStyleAsset extends ExternalAssetBase {
   type: "style";
   content: string;
   map?: EncodedSourceMap | null;
}

interface ExternalResourceAsset extends ExternalAssetBase {
   type: "resource";
   content: Blob;
}

type ExternalAsset =
   | ExternalScriptAsset
   | ExternalStyleAsset
   | ExternalResourceAsset;

interface CacheData {
   response?: Response;
   asset?: ExternalAsset;
}

const cache = new Map<string, CacheData>();
async function fetchUrl(this: Toypack, entryUrl: string) {
   const config = this.getConfig();
   const shouldMap = !!config.bundle.sourceMap;
   let assets: Record<string, ExternalAsset> = {};
   const recurse = async (url: string) => {
      if (assets[url]) return;
      let cached = cache.get(url);
      if (!cached) {
         cached = {};
         cache.set(url, cached);
      }

      const response = cached?.response ? cached.response : await fetch(url);
      cached.response ??= response;
      const type = getType(response);

      const source = "virtual:" + url;

      if (type == "resource") {
         cached.asset ??= assets[url] = {
            type: "resource",
            content: await response.blob(),
            url,
            source,
         };

         return true;
      }

      const asset = {
         type,
         url,
         source,
         lang: type == "script" ? "js" : "css",
      } as ExternalScriptAsset | ExternalStyleAsset;
      cached.asset ??= asset;
      assets[url] = asset;

      const rawContent = await response.clone().text();
      let dependencies: string[] = [];

      if (type == "script") {
         const parsedScript = await parseScriptAsset.call(
            this,
            source,
            rawContent,
            {
               inspectDependencies(node) {
                  const resolved = resolve(node.value, url);
                  node.value = "virtual:" + resolved;
               },
            }
         );

         dependencies = [...parsedScript.dependencies];

         const generated = generateScript(parsedScript.ast, {
            sourceFileName: source,
            filename: source,
            sourceMaps: shouldMap,
            comments: false,
         });

         asset.content = generated.code;
         asset.map = generated.map as any;
      } else {
         const parsedStyle = await parseStyleAsset.call(
            this,
            source,
            rawContent,
            {
               inspectDependencies(node) {
                  const resolved = resolve(node.value, url);
                  node.value = "virtual:" + resolved;
               },
            }
         );

         dependencies = [...parsedStyle.dependencies];

         const generated = generateStyle(parsedStyle.ast, {
            sourceMap: shouldMap,
         }) as any as CSSTreeGeneratedResult;

         if (typeof generated == "string") {
            asset.content = generated;
         } else {
            asset.content = generated.css;
            asset.map = MapConverter.fromObject(generated.map).toObject();
         }
      }

      // Get source map
      if (shouldMap) {
         let sourceMap =
            cached?.asset.type != "resource" && cached.asset.map
               ? cached.asset.map
               : await fetchSourceMapInContent(rawContent, url);

         if (sourceMap && asset.map) {
            asset.map = mergeSourceMaps(sourceMap, asset.map);
         } else {
            asset.map ||= sourceMap;
         }
      }

      // Fetch dependencies recursively
      for (const depSource of dependencies) {
         const resolved = resolve(depSource, url);

         const isSuccess = await recurse(resolved);
         // break if a dependency fails
         if (!isSuccess) return false;
      }

      return true;
   };

   await recurse(entryUrl);

   return assets;
}

export default function (): Plugin {
   let fetchedAssets: Record<string, ExternalAsset> = {};
   return {
      name: "import-url-plugin",
      resolve(id) {
         if (isUrl(id)) return "virtual:" + id;
      },
      load: {
         async: true,
         async handler(dep) {
            if (dep.type != "virtual") return;
            const url = dep.source.replace("virtual:", "");
            if (!isUrl(url)) return;

            // Fetch if it doesn't exist yet
            if (!(dep.source in fetchedAssets)) {
               const fetched = await fetchUrl.call(this.bundler, url);
               Object.assign(fetchedAssets, fetched);
            }

            // Out
            const asset = fetchedAssets[url];
            if (asset) {
               return asset;
            }
         },
      },
   };
}
