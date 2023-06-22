import path from "path-browserify";
import { supportedExtensions } from "./extensions.js";

/**
 * Test if a source is supported.
 */
export function isSupported(source: string) {
   source = source.split("?")[0];
   return supportedExtensions.includes(path.extname(source));
}