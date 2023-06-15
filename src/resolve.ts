import path from "path-browserify";
import { Toypack } from "./Toypack.js";
import { isLocal, isURL, parseURL } from "./utils.js";

/**
 * Searches for the fallback data of a module id in the `fallback` field of the `bundleOptions.resolve` object.
 *
 * @param {object} this - The bundler instance.
 * @param {string} moduleId - The module id.
 * @returns {object} The fallback data.
 */
export function getResolveFallbackData(this: Toypack, moduleId: string) {
   const fallbacks = this.config.bundle.resolve.fallback;
   if (fallbacks) {
      for (const [id, fallback] of Object.entries(fallbacks)) {
         if (moduleId.startsWith(id)) {
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
 * @param {Toypack} this The bundler instance.
 * @param {string} moduleId The module id.
 * @returns {object} The alias data.
 */
export function getResolveAliasData(this: Toypack, moduleId: string) {
   const aliases = this.config.bundle.resolve.alias;
   if (aliases) {
      // Find strict equals first
      for (const [alias, replacement] of Object.entries(aliases)) {
         if (moduleId === alias) {
            return {
               alias,
               replacement,
            };
         }
      }

      for (const [alias, replacement] of Object.entries(aliases)) {
         const aliasRegex = new RegExp(`^${alias}/`);
         if (aliasRegex.test(moduleId)) {
            return {
               alias,
               replacement,
            };
         }
      }
   }
}

function tryFileThenIndex(this: Toypack, source: string, extensions: string[]) {
   const file = loadAsFile.call(this, source, extensions);

   if (file) {
      return file;
   } else {
      return loadIndex.call(this, source, extensions);
   }
}

function loadAsDirectory(this: Toypack, source: string, extensions: string[]) {
   const pkg = this.getAsset(path.join(source, "package.json"));
   const mainFieldValue =
      typeof pkg?.content == "string"
         ? (JSON.parse(pkg.content).main as string)
         : null;
   if (mainFieldValue) {
      const absolutePath = path.join(source, mainFieldValue);
      const res = tryFileThenIndex.call(this, absolutePath, extensions);
      if (res) {
         return res;
      }
   }

   return tryFileThenIndex.call(this, source, extensions);
}

function loadAsFile(this: Toypack, source: string, extensions: string[]) {
   if (path.extname(source)) {
      // Get exact match if there's a file extension
      const asset = this.getAsset(source);

      if (asset) {
         return asset.source;
      }
   } else {
      // If there's no extension, get matching paths while ignoring the extensions
      for (let i = 0; i < extensions.length; i++) {
         const extension = extensions[i];
         const asset = this.getAsset(source + extension);

         if (asset) {
            return asset.source;
         }
      }
   }

   return null;
}

function loadIndex(this: Toypack, source: string, extensions: string[]) {
   const resolvedIndex = path.join(source, "index");
   return loadAsFile.call(this, resolvedIndex, extensions);
}

function getResolved(this: Toypack, source: string, opts: IResolveOptionsComp) {
   if (source.startsWith("/") && this.getAsset(source)) {
      return source;
   }

   if (opts.includeCoreModules && !isLocal(source) && !isURL(source)) {
      const resolved = path.join("/", "node_modules", source);
      return loadAsDirectory.call(this, resolved, opts.extensions);
   } else if (isURL(source)) {
      return source;
   } else {
      const resolved = path.join("/", opts.baseDir, source);
      const file = loadAsFile.call(this, resolved, opts.extensions);
      if (file) {
         return file;
      } else {
         return loadAsDirectory.call(this, resolved, opts.extensions);
      }
   }
}

/**
 * Resolves a module path to its absolute path.
 *
 * @param {Toypack} this The bundler instance.
 * @param {string} source The module path to resolve.
 * @param {IResolveOptions} options Resolving options.
 * @returns {string} The absolute path of the module.
 */
export function resolve(
   this: Toypack,
   source: string,
   options: Partial<IResolveOptions> = {}
) {
   source = source.split("?")[0];
   let result: string | null = "";
   const opts: IResolveOptionsComp = Object.assign(
      {
         baseDir: ".",
         includeCoreModules: true,
         extensions: this.config.bundle.resolve.extensions,
      },
      options
   );

   const origSource = source;

   // Resolve.extensions
   const extensions = [
      ...this.getExtensions("script"),
      ...this.getExtensions("style"),
      ...this.getExtensions("resource"),
   ].filter((ext) => {
      return !opts.extensions.includes(ext);
   });

   opts.extensions.push(...extensions);

   // Resolve.alias
   const aliasData = getResolveAliasData.call(this, source);
   if (aliasData) {
      let aliased = path.join(
         aliasData.replacement,
         source.replace(aliasData.alias, "")
      );
      const aliasIsCoreModule =
         !isLocal(aliasData.replacement) && !isURL(aliasData.replacement);

      if (!aliasIsCoreModule) {
         aliased = "./" + path.relative(opts.baseDir, aliased);
      }

      source = aliased;
   }

   result = getResolved.call(this, source, opts);

   // Resolve.fallback
   if (!result) {
      const fallbackData = getResolveFallbackData.call(this, origSource);
      if (fallbackData) {
         if (fallbackData.fallback === false) {
            // Add module with empty object for fallbacks with no polyfill
            const emptyFallbackModuleSource =
               "/node_modules/toypack/empty/index.js";
            let empty = this.getAsset(emptyFallbackModuleSource);

            if (!empty) {
               empty = this.addOrUpdateAsset(
                  emptyFallbackModuleSource,
                  "module.exports = {};"
               );
            }

            result = empty.source;
         } else {
            result = getResolved.call(this, fallbackData.fallback, opts);
         }
      }
   }

   return result;
}

// Types
export interface IResolveOptions {
   baseDir: string;
   includeCoreModules: boolean;
}

interface IResolveOptionsComp extends IResolveOptions {
   extensions: string[];
}
