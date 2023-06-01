import path from "path-browserify";
import { Toypack } from "./Toypack.js";
import { isLocal, isURL } from "./utils.js";

const defaultResolveOptions = {
   baseDir: ".",
   includeCoreModules: true,
   extensions: [".js", ".json"],
};

export type ResolveOptions = typeof defaultResolveOptions;

function tryFileThenIndex(bundler: Toypack, x: string, extensions: string[]) {
   const file = loadAsFile(bundler, x, extensions);

   if (file) {
      return file;
   } else {
      return loadIndex(bundler, x, extensions);
   }
}

function loadAsDirectory(bundler: Toypack, x: string, extensions: string[]) {
   const pkg = bundler.assets.get(path.join(x, "package.json"));

   if (typeof pkg?.content == "string") {
      const main = JSON.parse(pkg.content).main;
      if (!main) {
         return tryFileThenIndex(bundler, x, extensions);
      } else {
         const absolutePath = path.join(x, main);
         return tryFileThenIndex(bundler, absolutePath, extensions);
      }
   } else {
      return tryFileThenIndex(bundler, x, extensions);
   }
}

function loadAsFile(bundler: Toypack, x: string, extensions: string[]) {
   if (path.extname(x)) {
      // Get exact match if there's a file extension
      const asset = bundler.assets.get(x);

      if (asset) {
         return asset.source;
      }
   } else {
      // If there's no extension, get matching paths while ignoring the extensions
      for (let i = 0; i < extensions.length; i++) {
         const extension = extensions[i];
         const asset = bundler.assets.get(x + extension);

         if (asset) {
            return asset.source;
         }
      }
   }

   return "";
}

function loadIndex(bundler: Toypack, x: string, extensions: string[]) {
   const resolvedIndex = path.join(x, "index");
   return loadAsFile(bundler, resolvedIndex, extensions);
}

function getResolved(bundler: Toypack, x: string, opts: ResolveOptions) {
   if (opts.includeCoreModules && !isLocal(x) && !isURL(x)) {
      const resolved = path.join("/", "node_modules", x);
      return loadAsDirectory(bundler, resolved, opts.extensions);
   } else if (isURL(x)) {
      return x;
   } else {
      const resolved = path.join("/", opts.baseDir, x);
      const file = loadAsFile(bundler, resolved, opts.extensions);
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
export function resolve(
   bundler: Toypack,
   x: string,
   options?: Partial<ResolveOptions>
): string {
   if (typeof x !== "string") {
      throw new TypeError("Path must be a string. Received " + typeof x);
   }

   let result = "";
   const opts = Object.assign(defaultResolveOptions, options);

   const extensions = [
      ...bundler.extensions.application,
      ...bundler.extensions.style,
      ...bundler.extensions.resource,
   ].filter((ext) => {
      return opts.extensions.includes(ext);
   });

   opts.extensions.push(...extensions);

   result = getResolved(bundler, x, opts);

   return result;
}
