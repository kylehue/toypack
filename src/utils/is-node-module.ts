/**
 * Check if the source is located in /node_modules
 * @param source The source to check.
 * @returns A boolean.
 */
export function isNodeModule(source: string) {
   return /^\/?node_modules/.test(source);
}
