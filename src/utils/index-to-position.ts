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
