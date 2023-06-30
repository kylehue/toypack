import path from "path-browserify";
import { isLocal } from "./is-local.js";
import { isUrl } from "./is-url.js";

/**
 * Searches for the fallback data of a source path.
 */
export function getResolveFallbackData(
   fallbacks: Record<string, string | false>,
   moduleId: string
) {
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
 * Searches for the alias data of a source path.
 */
export function getResolveAliasData(
   aliases: Record<string, string>,
   moduleId: string
) {
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

function tryFileThenIndex(
   assets: Record<string, string>,
   sourceToResolve: string,
   options: ResolveOptions
) {
   const file = loadAsFile(assets, sourceToResolve, options);

   if (file) {
      return file;
   } else {
      return loadIndex(assets, sourceToResolve, options);
   }
}

function loadAsDirectory(
   assets: Record<string, string>,
   sourceToResolve: string,
   options: ResolveOptions
) {
   const pkg = assets[path.join(sourceToResolve, "package.json")];
   const mainFieldValue =
      typeof pkg == "string" ? (JSON.parse(pkg).main as string) : null;
   if (mainFieldValue) {
      const absolutePath = path.join(sourceToResolve, mainFieldValue);
      const res = tryFileThenIndex(assets, absolutePath, options);
      if (res) {
         return res;
      }
   }

   return tryFileThenIndex(assets, sourceToResolve, options);
}

function loadAsFile(
   assets: Record<string, string>,
   sourceToResolve: string,
   options: ResolveOptions
) {
   if (
      path.extname(sourceToResolve) &&
      typeof assets[sourceToResolve] == "string"
   ) {
      return sourceToResolve;
   } else {
      for (let i = 0; i < options.extensions.length; i++) {
         const extension = options.extensions[i];
         const sourceWithGuessedExtension = sourceToResolve + extension;
         if (typeof assets[sourceWithGuessedExtension] == "string") {
            return sourceWithGuessedExtension;
         }
      }
   }

   return null;
}

function loadIndex(
   assets: Record<string, string>,
   source: string,
   options: ResolveOptions
) {
   const resolvedIndex = path.join(source, "index");
   return loadAsFile(assets, resolvedIndex, options);
}

function getResolved(
   assets: Record<string, string>,
   sourceToResolve: string,
   options: ResolveOptions
) {
   if (
      sourceToResolve.startsWith("/") ||
      typeof assets[sourceToResolve] == "string"
   ) {
      return loadAsFile(assets, sourceToResolve, options);
   }

   if (
      options.includeCoreModules &&
      !isLocal(sourceToResolve) &&
      !isUrl(sourceToResolve)
   ) {
      const pre = path.join("/", "node_modules", sourceToResolve);
      return loadAsDirectory(assets, pre, options);
   } else if (isUrl(sourceToResolve)) {
      return sourceToResolve;
   } else {
      const pre = path.join("/", options.baseDir, sourceToResolve);
      const file = loadAsFile(assets, pre, options);
      if (file) {
         return file;
      } else {
         return loadAsDirectory(assets, pre, options);
      }
   }
}

/**
 * Resolves a relative path to its absolute path.
 */
export function resolve(
   assets: Record<string, string>,
   sourceToResolve: string,
   options: Partial<ResolveOptions> = {}
) {
   sourceToResolve = sourceToResolve.split("?")[0];
   let result: string | null = "";
   const opts: ResolveOptions = Object.assign(
      Object.assign({}, defaultResolveOptions),
      options
   );

   const origSource = sourceToResolve;

   // Resolve.alias
   const aliasData = getResolveAliasData(opts.aliases, sourceToResolve);
   if (aliasData) {
      const isExternal = isUrl(aliasData.replacement);
      let aliased = isExternal ? aliasData.replacement : path.join(
         aliasData.replacement,
         sourceToResolve.replace(aliasData.alias, "")
      );

      if (isLocal(aliasData.replacement) && !isExternal) {
         aliased = "./" + path.relative(opts.baseDir, aliased);
      }

      sourceToResolve = aliased;
   }

   result = getResolved(assets, sourceToResolve, opts);

   // Resolve.fallback
   if (!result) {
      const fallbackData = getResolveFallbackData(opts.fallbacks, origSource);
      if (!fallbackData) return null;
      if (fallbackData.fallback === false) {
         result = "virtual:empty";
      } else {
         result = getResolved(assets, fallbackData.fallback, opts);
      }
   }

   return result;
}

const defaultResolveOptions = {
   baseDir: "",
   includeCoreModules: true,
   extensions: [".js", ".json"],
   aliases: {} as Record<string, string>,
   fallbacks: {} as Record<string, string | false>,
};

export type ResolveOptions = typeof defaultResolveOptions;
