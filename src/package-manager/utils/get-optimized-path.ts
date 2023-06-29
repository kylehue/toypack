import path from "path-browserify";
import { PackageProvider } from "..";
import { getPackageInfoFromUrl } from "./get-package-info.js";
import { removeProviderHostFromUrl } from "./";

/**
 * Get the optimized path from a url. If url is
 * `https://example.com/sub/@scope/name@1.0.0/test.css`, it should output:
 * - `/node_modules/@scope/name@1.0.0/test.css` as the path and;
 * - `@scope/name@1.0.0/test.css` as the importPath.
 * @param pkgName The name of the package.
 * @param pkgVersion The version of the package.
 * @param url The url used to fetch the package.
 * @param subpath The path to a filename in the package.
 * @param fallbackFilename The filename to use in case the subpath is empty or
 * doesn't have a filename.
 * @param provider The package provider used to fetch url.
 * @returns An object containing the path and the importPath.
 */
export function getOptimizedPath(
   pkgName: string,
   pkgVersion: string,
   url: string,
   subpath: string,
   fallbackFilename: string,
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
         filename: fallbackFilename,
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
         fallbackFilename = path.join(subpath, fallbackFilename);
      } else {
         fallbackFilename = subpath;
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
         fallbackFilename,
         forceVersionAs
      );

      // Need to make sure the package name was extracted
      if (pkgInfo.name) {
         result.path = path.join(
            "/node_modules",
            path.join(
               pkgInfo.fullPackageName,
               path.dirname(subpath),
               pkgInfo.filename
            )
         );
      }
   }

   if (!result.path) {
      result.path =
         `/node_modules/${pkgName}@${
            forceVersionAs || pkgVersion || "latest"
         }/` + removeProviderHostFromUrl(url, provider);
   }

   result.importPath = result.path.replace(/^\/node_modules\//, "");
   return result;
}
