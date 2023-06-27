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

export function getUrlFromProviderHost(provider: PackageProviderConfig) {
   return "https://" + provider.host + "/";
}

export function removeProviderHostFromUrl(
   url: string,
   provider: PackageProviderConfig
) {
   return url.replace(getUrlFromProviderHost(provider), "");
}

export function getFetchUrlFromProvider(
   provider: PackageProviderConfig,
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

function trimSlashes(str?: string) {
   return str ? str.replace(/^\//, "").replace(/\/$/, "") : undefined;
}

const packageInfoPatterns = [
   new RegExp(
      `.*/(?:@(?<scope>[a-z0-9\\-_]+)/)(?<name>[a-z0-9\\-_]+)(?:@v?(?<version>[\\.a-z0-9]+)).*`
   ),
   new RegExp(`.*/(?<name>[a-z0-9\\-_]+)(?:@v?(?<version>[\\.a-z0-9]+)).*`),
];

export function getPackageInfoFromUrl(str: string) {
   let scope, name, version;
   for (const reg of packageInfoPatterns) {
      if (scope && name && version) break;
      const matches = reg.exec(str);
      if (!matches?.groups) continue;
      scope ??= matches.groups.scope?.replace(/^@/, "");
      name ??= matches.groups.name;
      /**
       * If the regex somehow captures a name like name@1.0.0,
       * we can just manually extract the name and version from it.
       */
      if (name && name.indexOf("@") >= 1) {
         [name, version] = name.split("@");
      }

      version ??= matches.groups.version?.replace(/^@/, "");
   }

   // Finalize
   version ??= "latest";
   let fullPath = "";
   if (scope) {
      scope = trimSlashes(scope.split("?")[0]);
      fullPath += `@${scope}/`;
   }
   if (name) {
      name = trimSlashes(name.split("?")[0]);
      fullPath += name;
   }
   if (version) {
      version = trimSlashes(version.split("?")[0].replace("v", ""));
      fullPath += `@${version}`;
   }

   return {
      fullPath,
      scope,
      name,
      version,
   };
}

export function getOptimizedPath(
   url: string,
   subpath: string,
   filename: string,
   version: string,
   provider: PackageProviderConfig
): {
   path: string;
   importPath: string;
} {
   if (typeof provider.handlePath == "function") {
      const optimizedPath = provider.handlePath({url, subpath, filename, version, provider});
      return typeof optimizedPath == "string" ? {
         path: optimizedPath,
         importPath: optimizedPath
      } : optimizedPath;
   }

   if (subpath) {
      if (!path.extname(subpath)) {
         filename = path.join(subpath, filename);
      } else {
         filename = subpath;
      }
   }

   const result = {
      path: "",
      importPath: "",
   };

   url = url.split("?")[0];

   if (!result.path) {
      const pkgInfo = getPackageInfoFromUrl(url);

      if (pkgInfo.name) {
         result.importPath = path.join(pkgInfo.fullPath, filename);
         result.path = path.join("/node_modules", result.importPath);
      }
   }

   if (!result.path) {
      result.importPath =
         `${name}@${version}/` + removeProviderHostFromUrl(url, provider);
      result.path = "/node_modules/" + result.importPath;
   }

   return result;
}
