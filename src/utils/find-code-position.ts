/**
 * Finds the position of a code snippet within a source code string
 * while ignoring the whitespaces for each line.
 * @param sourceStr The source code string to search within.
 * @param searchStr The code snippet to search for.
 * @returns {Object} An object containing the 1-based line and
 * 0-based column position of the found code snippet. If the code
 * snippet is not found, the line and column will be -1.
 */
export function findCodePosition(sourceStr: string, searchStr: string) {
   const sourceLines = sourceStr.split("\n");
   const searchLines = searchStr.split("\n");
   let line = -1;
   let column = -1;

   for (let i = 1; i < sourceLines.length + 1; i++) {
      const sourceLine = sourceLines[i - 1].trim();

      if (line >= 0) {
         if (
            sourceLine != searchLines[i - line]?.trim() &&
            i - line < searchLines.length
         ) {
            line = -1;
         }
      } else {
         if (sourceLine == searchLines[0]?.trim()) {
            line = i;
            column = sourceLines[i - 1].indexOf(searchLines[0]?.trim());
         }
      }
   }

   return { line, column };
}
