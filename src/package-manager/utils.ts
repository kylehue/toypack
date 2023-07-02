import path from "path-browserify";
import { PackageProvider } from ".";
import { EXTENSIONS, isUrl, parsePackageName } from "../utils";
import { PackageAsset } from "./fetch-package";
import { RawSourceMap } from "source-map-js";

export const _cache = new Map<
   string,
   {
      rawContent: string;
      response: Response;
      map?: RawSourceMap | null;
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
   packageSource: string
) {
   const { name, version, subpath } = parsePackageName(packageSource);
   return (
      getUrlFromProviderHost(provider) +
      path
         .join(
            provider.prepath || "",
            name + "@" + version,
            subpath,
            provider.postpath || ""
         )
         .replace(/^\//, "") +
      queryParamsToString(provider.queryParams)
   );
}

export function resolve(
   importSource: string,
   importerSource: string = "/",
   root: string = ""
) {
   // If url
   if (isUrl(importSource)) return importSource;

   // If absolute
   if (importSource.startsWith("/")) {
      return root + path.join(importSource).replace(/^\//, "");
   }

   // If relative
   importerSource = importerSource.replace(root, "");
   return (
      root + path.join(path.dirname(importerSource), importSource).replace(/^\//, "")
   );
}

export function getSource(
   name: string,
   version: string,
   subpath: string,
   url: string,
   isEntry: boolean,
   type: "script" | "style"
) {
   let source = isEntry
      ? path.join(
           "/node_modules",
           `${name}@${version}`,
           subpath,
           path.extname(subpath)
              ? ""
              : "index" + (type == "script" ? ".js" : ".css")
        )
      : getNodeModulesPath(url, name, version);

   if (!path.extname(source)) {
      source += "/index" + (type == "script" ? ".js" : ".css");
   }

   return source;
}

export function getNodeModulesPath(
   url: string,
   name: string,
   version: string
) {
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
   const extension = path.extname(response.url);
   const isScript =
      mimeType == "application/javascript" ||
      mimeType == "application/typescript" ||
      EXTENSIONS.script.includes(extension);
   const isStyle =
      mimeType == "text/css" || EXTENSIONS.style.includes(extension);
   return isScript ? "script" : isStyle ? "style" : null;
}

export function findDuplicateAsset(url: string, dedupeConfig: string[][]) {
   const group = dedupeConfig.find((a) => a.includes(url));
   if (!group || !group.length) return null;
   const duplicateUrl = group[0] == url ? null : group[0];
   if (!duplicateUrl) return null;
   return _cache.get(duplicateUrl)?.asset || null;
}