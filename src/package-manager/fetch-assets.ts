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
import { ERRORS, EXTENSIONS, getSourceMapUrl, mergeSourceMaps } from "../utils";
import { PackageProviderConfig, Package } from ".";
import {
   getFetchUrlFromProvider,
   getExtension,
   getType,
   resolve,
} from "./utils.js";

const cache = new Map<
   string,
   {
      content: string;
      response: Response;
      map?: RawSourceMap | null;
   }
>();
export async function fetchAssets(
   this: Toypack,
   provider: PackageProviderConfig,
   name: string,
   version: string,
   onProviderFallback: () => PackageProviderConfig | null
) {
   const config = this.getConfig();
   let assets: Package["assets"] = {};
   const entryUrl = getFetchUrlFromProvider(provider, name, version);
   let entryResponse: Response = {} as Response;

   const recurse = async (url: string) => {
      const source = url.split("?")[0];

      if (assets[source]) return;

      const cached = cache.get(url);
      const response = cached ? cached.response : await fetch(url);
      if (!response.ok) {
         let newProvider = onProviderFallback();
         if (newProvider) {
            assets = {};
            provider = newProvider;
            await recurse(getFetchUrlFromProvider(provider, name, version));
         }

         return;
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

         return;
      }

      const rawContent = cached ? cached.content : await response.text();
      let content = "";
      let map: RawSourceMap | null = null;

      // Parse
      let ast: CssNode | Node, rawDependencies: string[];
      let dependencies: string[] = [];
      if (type == "script") {
         const parserOptions: ParserOptions = {
            plugins:
               extension == ".d.ts" ? [["typescript", { dts: true }]] : [],
         };

         const parsedScript = await parseScriptAsset.call(
            this,
            source,
            rawContent,
            {
               parserOptions,
               // Resolve import paths to /node_modules/
               inspectDependencies(node) {
                  const resolved = resolve(node.value, url, provider.host);
                  node.value =
                     `/node_modules/${name}/` +
                     resolved.replace(provider.host, "");
                  dependencies.push(node.value);
               },
            }
         );

         ast = parsedScript.ast;
         rawDependencies = parsedScript.dependencies;
         const generated = generateScript(parsedScript.ast, {
            sourceFileName: source,
            filename: source,
            sourceMaps: !!config.bundle.sourceMap,
         });

         content = generated.code;
         map = generated.map as any;
      } else {
         const parsedStyle = await parseStyleAsset.call(
            this,
            source,
            rawContent,
            {
               inspectDependencies(node) {
                  const resolved = resolve(node.value, url, provider.host);
                  node.value =
                     `/node_modules/${name}/` +
                     resolved.replace(provider.host, "");
                  dependencies.push(node.value);
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
         source,
         ast,
         isEntry: url === entryUrl,
         url,
         dependencies,
         content,
      } as PackageAsset;

      assets[source] = asset;

      if (asset.type == "script") {
         asset.dts = extension == ".d.ts" ? true : false;
      }

      if (asset.isEntry) {
         entryResponse = response;
      }

      // Get dependency's dependencies by recursing
      for (const depSource of rawDependencies) {
         const resolved = resolve(depSource, url, provider.host);
         await recurse(resolved);
      }

      // Source maps?
      if (!!config.bundle.sourceMap) {
         const sourceMapUrl = getSourceMapUrl(rawContent);
         if (sourceMapUrl) {
            asset.content = asset.content
               .replace(/\/\/[#@]\s*sourceMappingURL=(.+)\s*$/, "")
               .trimEnd();

            const resolved = resolve(sourceMapUrl, url, provider.host);
            const sourceMap = cached
               ? cached.map
               : await (await fetch(resolved)).json();
            if (sourceMap && map) {
               asset.map = mergeSourceMaps(sourceMap, map);
            } else {
               asset.map = sourceMap || map;
            }
         }
      }

      // Cache
      if (!cached)
         cache.set(url, { content: rawContent, response, map: asset.map });
   };

   await recurse(entryUrl);

   // Get dts files
   if (
      config.packageManager.dts &&
      typeof provider.dtsHeader == "string" &&
      entryResponse.ok
   ) {
      const entryExtension = getExtension(entryUrl, provider);
      if (
         entryExtension != ".d.ts" &&
         (EXTENSIONS.script.includes(entryExtension) ||
            !EXTENSIONS.style.includes(entryExtension))
      ) {
         const dtsUrl = entryResponse.headers.get(provider.dtsHeader);
         if (dtsUrl) {
            await recurse(resolve(dtsUrl, entryUrl, provider.host));
         } else {
            this._trigger(
               "onError",
               ERRORS.any(
                  "[package-manager] Error: Couldn't get the declaration types for " +
                     entryUrl
               )
            );
         }
      }
   }

   return finalizeAssets(assets, name, provider);
}

function finalizeAssets(
   assets: Record<string, PackageAsset>,
   name: string,
   provider: PackageProviderConfig
) {
   const finalized: Record<string, PackageAsset> = {};
   for (const [source, asset] of Object.entries(assets)) {
      let newSource: string;
      if (asset.isEntry) {
         newSource =
            `/node_modules/${name}/index` +
            (asset.type == "script" ? ".js" : ".css");
      } else {
         newSource = source.replace(provider.host, `/node_modules/${name}/`);
      }

      if (!path.extname(newSource)) {
         newSource += asset.type == "script" && !asset.dts ? ".js" : ".css";
      }

      asset.source = newSource;
      finalized[newSource] = asset;
   }

   return finalized;
}

interface PackageAssetBase {
   source: string;
   url: string;
   map?: RawSourceMap | null;
   isEntry: boolean;
   dependencies: string[];
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
