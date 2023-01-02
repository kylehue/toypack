import { isLocal, isURL } from "@toypack/utils";
import path from "path-browserify";
import Toypack, { textExtensions, resourceExtensions } from "./Toypack";
import { ResolveOptions } from "./types";

/**
 * Searches for the fallback data of a module id in the `fallback` field of the `bundleOptions.resolve` object.
 *
 * @param {object} bundler - The bundler instance.
 * @param {string} x - The module id.
 * @returns {object} The fallback data.
 */
export function getResolveFallbackData(bundler: Toypack, x: string) {
   let fallbacks = bundler.options.bundleOptions?.resolve?.fallback;
   if (fallbacks) {
      for (let [id, fallback] of Object.entries(fallbacks)) {
         if (x.startsWith(id)) {
            return {
               id,
               fallback,
            };
         }
      }
   }
}

/**
 * Searches for the alias data of a module id in the `alias` field of the `bundleOptions.resolve` object.
 *
 * @param {Toypack} bundler The bundler instance.
 * @param {string} x The module id.
 * @returns {object} The alias data.
 */
export function getResolveAliasData(bundler: Toypack, x: string) {
   let aliases = bundler.options.bundleOptions?.resolve?.alias;
   if (aliases) {
      // Find strict equals first
      for (let [alias, replacement] of Object.entries(aliases)) {
         if (x === alias) {
            return {
               alias,
               replacement,
            };
         }
      }

      for (let [alias, replacement] of Object.entries(aliases)) {
         let aliasRegex = new RegExp(`^${alias}/`);
         if (aliasRegex.test(x)) {
            return {
               alias,
               replacement,
            };
         }
      }
   }
}

function tryFileThenIndex(bundler: Toypack, x: string, extensions: string[]) {
   let file = loadAsFile(bundler, x, extensions);

   if (file) {
      return file;
   } else {
      return loadIndex(bundler, x, extensions);
   }
}

function loadAsDirectory(bundler: Toypack, x: string, extensions: string[]) {
   let pkg = bundler.assets.get(path.join(x, "package.json"));

   if (typeof pkg?.content == "string") {
      let main = JSON.parse(pkg.content).main;
      if (!main) {
         return tryFileThenIndex(bundler, x, extensions);
      } else {
         let absolutePath = path.join(x, main);
         return tryFileThenIndex(bundler, absolutePath, extensions);
      }
   } else {
      return tryFileThenIndex(bundler, x, extensions);
   }
}

function loadAsFile(bundler: Toypack, x: string, extensions: string[]) {
   let parsedPath = path.parse(x);
   let noExt = path.join(parsedPath.dir, parsedPath.name);

   for (let i = 0; i < extensions.length; i++) {
      let extension = extensions[i];
      let asset = bundler.assets.get(noExt + extension);

      if (asset) {
         return asset.source;
      }
   }

   return "";
}

function loadIndex(bundler: Toypack, x: string, extensions: string[]) {
   let resolvedIndex = path.join(x, "index");
   return loadAsFile(bundler, resolvedIndex, extensions);
}

function getResolved(bundler: Toypack, x: string, opts) {
   if (opts.includeCoreModules && !isLocal(x) && !isURL(x)) {
      let resolved = path.join("/", "node_modules", x);
      return loadAsDirectory(bundler, resolved, opts.extensions);
   } else if (isURL(x)) {
      return x;
   } else {
      let resolved = path.join("/", opts.baseDir, x);
      let file = loadAsFile(bundler, resolved, opts.extensions);
      if (file) {
         return file;
      } else {
         return loadAsDirectory(bundler, resolved, opts.extensions);
      }
   }
}

/**
 * Resolves a module path to its absolute path.
 *
 * @param {Toypack} bundler The bundler instance.
 * @param {string} x The module path to resolve.
 * @param {ResolveOptions} options Resolving options.
 * @returns {string} The absolute path of the module.
 */
export default async function resolve(
   bundler: Toypack,
   x: string,
   options?: ResolveOptions
) {
   if (typeof x !== "string") {
      throw new TypeError("Path must be a string. Received " + typeof x);
   }

   let result = "";
   let orig = x;

   // Resolve.extensions
   let extensions = [...textExtensions, ...resourceExtensions];
   let priorityExtensions = bundler.options.bundleOptions?.resolve?.extensions;
   if (priorityExtensions) {
      for (let priorityExtension of priorityExtensions) {
         let index = extensions.indexOf(priorityExtension);
         if (index >= 0) {
            extensions.splice(index, 1);
         }
      }

      extensions = [...priorityExtensions, ...extensions];
   }

   const opts = Object.assign(
      {
         extensions,
         baseDir: ".",
         includeCoreModules: true,
      },
      options
   );

   // Resolve.alias
   let aliasData = getResolveAliasData(bundler, x);
   if (aliasData) {
      let aliased = path.join(
         aliasData.replacement,
         x.replace(aliasData.alias, "")
      );
      let aliasIsCoreModule =
         !isLocal(aliasData.replacement) && !isURL(aliasData.replacement);

      if (!aliasIsCoreModule) {
         aliased = "./" + path.relative(opts.baseDir, aliased);
      }

      x = aliased;
   }

   result = getResolved(bundler, x, opts);

   // Resolve.fallback
   if (!result) {
      let fallbackData = getResolveFallbackData(bundler, orig);
      if (fallbackData) {
         if (typeof fallbackData.fallback == "boolean") {
            // Add module with empty object for fallbacks with no polyfill
            let empty = bundler.assets.get(
               "/node_modules/toypack/empty/index.js"
            );

            if (!empty) {
               empty = await bundler.addAsset(
                  "/node_modules/toypack/empty/index.js",
                  "module.exports = {};"
               );
            }

            result = empty.source;
         } else if (typeof fallbackData.fallback == "string") {
            result = getResolved(bundler, fallbackData.fallback, opts);
         }
      }
   }

   return result;
}
