/**
 * Get the source map url of a content.
 */
export function getSourceMapUrl(content: string) {
   const regex = /\/\/[#@]\s*sourceMappingURL=(.+)\s*$/gm;
   const matches = regex.exec(content);
   if (matches && matches.length > 1) {
      return matches[1].trim();
   }

   return null;
}
