/**
 * Check if the source doesn't contain invalid characters such as `? / \ : * < > "`
 * @param source The source string to check.
 * @returns A boolean.
 */
export function isValidAssetSource(source: string) {
   return !/[\\:*?"<>]/.test(source);
}