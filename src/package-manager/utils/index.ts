import path from "path-browserify";
import { Package, PackageProvider } from "..";
import { EXTENSIONS, isUrl, parsePackageName } from "../../utils";

export function queryParamsToString(params?: Record<string, string | true>) {
   if (!params) return "";

   let str = "?";

   for (const [key, value] of Object.entries(params)) {
      str += `${key}${typeof value == "string" && value ? `=${value}` : ""}&`;
   }

   return str.replace(/&$/, "");
}

export function getFetchUrlFromProvider(
   provider: PackageProvider,
   name: string,
   version?: string
) {
   const parsed = parsePackageName(name);
   return (
      "https://" +
      provider.host +
      path.join(
         "/",
         provider.prepath || "",
         parsed.name + "@" + (version || parsed.version || "latest"),
         parsed.path,
         provider.postpath || ""
      ) +
      queryParamsToString(provider.queryParams)
   );
}

export function resolve(
   source: string,
   parentSource: string = "/",
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

export function getExtension(url: string, provider: PackageProvider) {
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

export * from "./get-optimized-path.js";
export * from "./get-package-info.js";
export * from "./get-provider-host-url.js";