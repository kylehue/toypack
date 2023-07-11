import path from "path-browserify";
import { PackageProvider } from ".";
import { isUrl } from "../utils";
import { PackageAsset, PackageResourceAsset } from "./fetch-package";
import { EncodedSourceMap } from "@jridgewell/gen-mapping";

export const _cache = new Map<
   string,
   | {
        type: "resource";
        rawContent: Blob;
        response: Response;
        asset: PackageResourceAsset;
     }
   | {
        type: "script" | "style";
        rawContent: string;
        response: Response;
        map?: EncodedSourceMap | null;
        asset: PackageAsset;
     }
>();

export function queryParamsToString(params?: Record<string, string | true>) {
   if (!params) return "";

   let str = "?";

   for (const [key, value] of Object.entries(params)) {
      str += `${key}${typeof value == "string" && value ? `=${value}` : ""}&`;
   }

   return str.replace(/&$/, "");
}

export function getUrlFromProviderHost(provider: PackageProvider) {
   return "https://" + provider.host + "/";
}

export function removeProviderHostFromUrl(
   url: string,
   provider: PackageProvider
) {
   return url.replace(getUrlFromProviderHost(provider), "");
}

export function getFetchUrlFromProvider(
   provider: PackageProvider,
   name: string,
   version: string,
   subpath: string
) {
   const args = { name, version, subpath };
   const prepath =
      typeof provider.prepath == "function"
         ? provider.prepath(args)
         : provider.prepath;
   const postpath =
      typeof provider.postpath == "function"
         ? provider.postpath(args)
         : provider.postpath;
   const queryParams =
      typeof provider.queryParams == "function"
         ? provider.queryParams(args)
         : provider.queryParams;
   return (
      getUrlFromProviderHost(provider) +
      path
         .join(prepath || "", name + "@" + version, subpath, postpath || "")
         .replace(/^\//, "") +
      queryParamsToString(queryParams)
   );
}

export function resolve(
   importSource: string,
   importerSource: string = "/"
) {
   // If url
   if (isUrl(importSource)) return importSource;
   
   let root = "";
   if (isUrl(importerSource)) {
      root = new URL(importerSource).origin + "/";
   }

   // If absolute
   if (importSource.startsWith("/")) {
      return root + path.join(importSource).replace(/^\//, "");
   }

   // If relative
   importerSource = importerSource.replace(root, "");
   return (
      root +
      path.join(path.dirname(importerSource), importSource).replace(/^\//, "")
   );
}

export function getSource(
   name: string,
   version: string,
   subpath: string,
   url: string,
   isEntry: boolean,
   type: "script" | "style" | "resource",
   isDts = false
) {
   let extname = path.extname(subpath.split("?")[0]);
   if (!extname) extname = type == "script" ? isDts ? ".d.ts" : ".js" : ".css";
   
   let source = isEntry
      ? path.join(
           "/node_modules",
           `${name}@${version}`,
           subpath || "index" + extname,
        )
      : getNodeModulesPath(url, name, version);

   if (!path.extname(source)) {
      source += "/index" + extname;
   }

   return source.split("?")[0];
}

export function getNodeModulesPath(url: string, name: string, version: string) {
   return path.join(
      "/node_modules",
      `${name}@${version}`,
      url.replace(/https?:\/\//, "")
   );
}

/**
 * Get mime type of response.
 */
export function getMimeType(response: Response) {
   return response.headers.get("Content-Type")?.split(";")?.[0];
}

/**
 * Get type based on response.
 */
export function getType(response: Response) {
   const mimeType = getMimeType(response);
   const isScript =
      mimeType == "application/javascript" ||
      mimeType == "application/typescript";
   const isStyle = mimeType == "text/css";
   return isScript ? "script" : isStyle ? "style" : "resource";
}

export function findDuplicateAsset(url: string, dedupeConfig: string[][]) {
   const group = dedupeConfig.find((a) => a.includes(url));
   if (!group || !group.length) return null;
   const duplicateUrl = group[0] == url ? null : group[0];
   if (!duplicateUrl) return null;
   return _cache.get(duplicateUrl)?.asset || null;
}