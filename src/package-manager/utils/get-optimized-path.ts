import path from "path-browserify";
import { PackageProvider } from "..";
import { getPackageInfoFromUrl } from "./get-package-info.js";
import { removeProviderHostFromUrl } from "./get-provider-host-url.js";

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
      const pkgInfo = getPackageInfoFromUrl(
         url,
         provider,
         filename,
         forceVersionAs
      );

      if (pkgInfo.name) {
         result.importPath = path.join(pkgInfo.fullPackageName, filename);
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
