import path from "path-browserify";
import * as EXTENSIONS from "./extensions.js";

/**
 * Test if a source is supported.
 */
export function isSupported(source: string) {
   source = source.split("?")[0];
   return EXTENSIONS.supported.includes(path.extname(source));
}