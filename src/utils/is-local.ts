import { isUrl } from "./is-url.js";

/**
 * Checks if source begins with `../`, `./`, `/`, or `virtual:`
 * @param source The source to check.
 * @returns A boolean.
 */
export function isLocal(source: string) {
   if (
      source.startsWith("./") ||
      source.startsWith("../") ||
      source.startsWith("/") ||
      source.startsWith("virtual:")
   ) {
      return !isUrl(source);
   }

   return false;
}
