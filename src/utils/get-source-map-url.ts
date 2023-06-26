/**
 * Get the source map url of a content.
 */
const singleLineRegex = /\/\/# *sourceMappingURL=(.+) *$/;
const multiLineRegex = /\/\* *# *sourceMappingURL=(.+) *\*\/$/;
export function getSourceMapUrl(content: string) {
   const singleLineMatches = singleLineRegex.exec(content);
   if (singleLineMatches && singleLineMatches.length > 1) {
      return singleLineMatches[1].trim();
   }

   const multiLineMatches = multiLineRegex.exec(content);
   if (multiLineMatches && multiLineMatches.length > 1) {
      return multiLineMatches[1].trim();
   }

   return null;
}

/**
 * Remove the sourceMappingUrl comment.
 */
export function removeSourceMapUrl(content: string) {
   return content
      .replace(singleLineRegex, "")
      .replace(multiLineRegex, "")
      .trimEnd();
}