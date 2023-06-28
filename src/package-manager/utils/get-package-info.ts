import path from "path-browserify";
import { PackageProvider } from "..";

const packageInfoPatterns = [
   new RegExp(
      `.*/(?:@(?<scope>[a-z0-9\\-_]+)/)(?<name>[a-z0-9\\-_]+)(?:@v?(?<version>[\\.a-z0-9]+)).*`
   ),
   new RegExp(`.*/(?<name>[a-z0-9\\-_]+)(?:@v?(?<version>[\\.a-z0-9]+)).*`),
];

function trimTrailingSlashes(str: string) {
   return str.replace(/^\//, "").replace(/\/$/, "");
}

function escapeRegex(str: string) {
   return str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

export function getPossibleFilename(url: string, provider: PackageProvider) {
   let possibleFilename;
   if (provider.postpath) {
      const providerPostPathRegex = new RegExp(
         `${escapeRegex(provider.postpath)}$`
      );
      possibleFilename = path.basename(url.replace(providerPostPathRegex, ""));
   } else {
      possibleFilename = path.basename(url);
   }

   return possibleFilename;
}

/**
 * Extract the scope, name, version, and filename from a url.
 * @param url The url to extract from.
 * @param provider The package provider used to get the url.
 * @param fallbackFilename Filename to use in case the filename can't
 * be detected.
 * @returns An object containing the package information.
 */
export function getPackageInfoFromUrl(
   url: string,
   provider: PackageProvider,
   fallbackFilename: string,
   overrideVersion?: string
) {
   let scope: string = "",
      name: string = "",
      version: string = "",
      filename: string = "";

   for (const reg of packageInfoPatterns) {
      if (scope && name && version) break;
      const matches = reg.exec(url);
      if (!matches?.groups) continue;
      scope ||= matches.groups.scope || "";
      name ||= matches.groups.name || "";
      /**
       * If the regex somehow captures a name like name@1.0.0,
       * we can just manually extract the name and version from it.
       */
      if (name && name.indexOf("@") >= 1) {
         [name, version] = name.split("@");
      }

      version ||= matches.groups.version || "";
   }

   /**
    * Let path be "https://obscure/path/@scope/name@1.0.0/file.js",
    * since its basename is "file.js" and not "name@1.0.0" (which is the
    * package name and version), we can say that it's the file name.
    *
    * But if the path is "https://obscure/path/@scope/name@1.0.0" (occurs
    * in providers like jsdelivr), its basename is its package name and
    * version. If this happens, we'll just use the `fallbackFilename`
    */
   let possibleFilename = getPossibleFilename(url, provider);
   if (new RegExp(`${name}@v?${escapeRegex(version)}`).test(possibleFilename)) {
      filename = fallbackFilename;
   } else if (!path.extname(possibleFilename)) {
      filename = possibleFilename + path.extname(fallbackFilename);
   } else {
      filename = possibleFilename;
   }

   if (typeof provider.handlePackageInfo == "function") {
      const pkgInfo = provider.handlePackageInfo(url);
      if (pkgInfo) {
         scope = pkgInfo.scope || "";
         name = pkgInfo.name || "";
         version = pkgInfo.version || "";

         // filename is important
         filename = pkgInfo.filename || filename;
      }
   }

   // Finalize
   let fullPackageName = "";
   if (scope) {
      scope = trimTrailingSlashes(scope.split("?")[0].replace(/^@/, ""));
      fullPackageName += `@${scope}/`;
   }
   if (name) {
      name = trimTrailingSlashes(name.split("?")[0]);
      fullPackageName += name;
   }

   if (overrideVersion) {
      version = overrideVersion;
   } else {
      version = !version
         ? "latest"
         : trimTrailingSlashes(
              version.split("?")[0].replace("v", "").replace(/^@/, "")
           );
   }

   fullPackageName += `@${version}`;

   const fullPath = path.join(fullPackageName, filename);

   return {
      scope,
      name,
      version,
      filename,
      fullPackageName,
      fullPath,
   };
}
