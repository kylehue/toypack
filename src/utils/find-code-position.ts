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
   const index = sourceStr.indexOf(searchStr);
   if (index >= 0) {
      return indexToPosition(sourceStr, index);
   }

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

/**
 * Converts the index number to a position (1-based line, 0-based column)
 * within the given content string.
 * @param content - The string content to calculate the position in.
 * @param index - The index number to convert to position.
 * @returns An object representing the position.
 */
export function indexToPosition(content: string, index: number) {
   if (index < 0) {
      throw new RangeError("The index must be greater than or equal to 0.");
   }

   const lines = content.substring(0, index).split("\n");
   const line = lines.length;
   const column = lines[lines.length - 1].length;
   return { line, column };
}
