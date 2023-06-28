import path from "path-browserify";
import { Package, PackageProvider } from ".";
import { EXTENSIONS, isUrl, parsePackageName } from "../utils";

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

function trimSlashes(str?: string) {
   return str ? str.replace(/^\//, "").replace(/\/$/, "") : undefined;
}

const packageInfoPatterns = [
   new RegExp(
      `.*/(?:@(?<scope>[a-z0-9\\-_]+)/)(?<name>[a-z0-9\\-_]+)(?:@v?(?<version>[\\.a-z0-9]+)).*`
   ),
   new RegExp(`.*/(?<name>[a-z0-9\\-_]+)(?:@v?(?<version>[\\.a-z0-9]+)).*`),
];

export function getPackageInfoFromUrl(
   url: string,
   provider: PackageProvider,
   forceVersionAs?: string
) {
   let scope,
      name,
      version = forceVersionAs;

   for (const reg of packageInfoPatterns) {
      if (scope && name && version) break;
      const matches = reg.exec(url);
      if (!matches?.groups) continue;
      scope ??= matches.groups.scope;
      name ??= matches.groups.name;
      /**
       * If the regex somehow captures a name like name@1.0.0,
       * we can just manually extract the name and version from it.
       */
      if (name && name.indexOf("@") >= 1) {
         [name, version] = name.split("@");
      }

      version ??= matches.groups.version;
   }

   if (typeof provider.handlePackageInfo == "function") {
      const pkgInfo = provider.handlePackageInfo(url);
      if (pkgInfo) {
         scope = pkgInfo.scope;
         name = pkgInfo.name;
         version = pkgInfo.version;
      }
   }

   // Finalize
   version ??= "latest";
   let fullPath = "";
   if (scope) {
      scope = trimSlashes(scope.split("?")[0].replace(/^@/, ""));
      fullPath += `@${scope}/`;
   }
   if (name) {
      name = trimSlashes(name.split("?")[0]);
      fullPath += name;
   }
   if (version) {
      version = trimSlashes(
         version.split("?")[0].replace("v", "").replace(/^@/, "")
      );
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
   pkgName: string,
   pkgVersion: string,
   url: string,
   subpath: string,
   filename: string,
   provider: PackageProvider,
   forceVersionAs?: string
): {
   path: string;
   importPath: string;
} {
   if (typeof provider.handlePath == "function") {
      const optimizedPath = provider.handlePath({
         name: pkgName,
         version: pkgVersion,
         url,
         subpath,
         filename,
         provider,
      });

      if (optimizedPath) {
         return typeof optimizedPath == "string"
            ? {
                 path: optimizedPath,
                 importPath: optimizedPath,
              }
            : optimizedPath;
      }
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
      const pkgInfo = getPackageInfoFromUrl(url, provider, forceVersionAs);

      if (pkgInfo.name) {
         result.importPath = path.join(pkgInfo.fullPath, filename);
         result.path = path.join("/node_modules", result.importPath);
      }
   }

   if (!result.path) {
      result.importPath =
         `${pkgName}@${forceVersionAs || pkgVersion}/` +
         removeProviderHostFromUrl(url, provider);
      result.path = "/node_modules/" + result.importPath;
   }

   return result;
}
