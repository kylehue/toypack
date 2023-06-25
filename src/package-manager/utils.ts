import path from "path-browserify";
import { PackageProviderConfig } from ".";
import { EXTENSIONS, isUrl, parsePackageName } from "../utils";

export function queryParamsToString(params?: Record<string, string | true>) {
   if (!params) return "";

   let str = "?";

   for (const [key, value] of Object.entries(params)) {
      str += `${key}${typeof value == "string" && value ? `=${value}` : ""}&`;
   }

   return str.replace(/&$/, "");
}

export function getFetchUrlFromProvider(
   provider: PackageProviderConfig,
   name: string,
   version = "latest"
) {
   const parsed = parsePackageName(name);
   return (
      provider.host +
      path.join(
         provider.prepath || "",
         parsed.name + "@" + version,
         parsed.path,
         provider.postpath || ""
      ) +
      queryParamsToString(provider.queryParams)
   );
}

export function resolve(
   source: string,
   parentSource: string,
   root: string = "/"
) {
   if (isUrl(source)) return source;
   parentSource = parentSource.replace(root, "");

   // @types/@babel/core -> @types/babel__core
   if (parentSource.startsWith("@") && source.startsWith("@")) {
      source = source.replace(/^@/, "").replace(/\//, "__");
   }

   if (source.startsWith("/")) {
      return root + path.join(source).replace(/^\//, "");
   }

   return (
      root + path.join(path.dirname(parentSource), source).replace(/^\//, "")
   );
}

export function getExtension(url: string, provider: PackageProviderConfig) {
   url = url.split("?")[0];

   if (provider.postpath) {
      url = url.replace(
         new RegExp(
            provider.postpath.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")
         ),
         ""
      );
   }

   if (
      /\.d\.(c|m)?ts$/.test(url) ||
      /^@types\//.test(url.replace(provider.host, ""))
   ) {
      return ".d.ts";
   }

   return path.extname(url) || ".js";
}

export function getType(extension: string, response?: Response | null) {
   const mimeType = response?.headers.get("Content-Type")?.split(";")[0];
   const isScript =
      mimeType == "application/javascript" ||
      EXTENSIONS.script.includes(extension) ||
      extension == ".d.ts";
   const isStyle =
      mimeType == "text/css" || EXTENSIONS.style.includes(extension);
   return isScript ? "script" : isStyle ? "style" : null;
}
