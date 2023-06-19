import { isUrl } from "./is-url.js";

/**
 * Checks if source begins with ../, ./, or /
 * @param source The source to check.
 * @returns A boolean.
 */
export function isLocal(source: string) {
   if (
      source.startsWith("./") ||
      source.startsWith("../") ||
      source.startsWith("/")
   ) {
      return !isUrl(source);
   }

   return false;
}
