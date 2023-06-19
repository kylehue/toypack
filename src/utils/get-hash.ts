/**
 * Generate a variable-safe hash from string.
 * @returns The hash string.
 */
export function getHash(str: string): string {
   if (str.length === 0) {
      throw new Error("String must contain at least 1 character.");
   }

   let hash = 0;
   for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
   }
   const uniqueId = (hash >>> 0).toString(16);
   return "h" + uniqueId;
}
