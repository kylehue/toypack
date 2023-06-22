import path from "path-browserify";
import Toypack from "../Toypack.js";
import { getHash } from "./get-hash.js";

/**
 * Convert a resource's source path to a useable source path.
 * If in development mode, the resource path will become a blob url.
 * If in production mode, the resource path will have a unique hash as
 * its basename.
 * @returns The useable source path string.
 */
export function getUsableResourcePath(
   bundler: Toypack,
   source: string,
   baseDir = "."
) {
   const resolvedSource = bundler.resolve(source, { baseDir });
   const asset = resolvedSource ? bundler.getAsset(resolvedSource) : null;
   if (!asset || asset.type != "resource") return null;
   if (bundler.getConfig().bundle.mode == "production") {
      return "./" + getHash(asset.source) + path.extname(asset.source);
   } else {
      return asset.contentURL;
   }
}
