/**
 * Converts a string to PascalCase.
 * @param str The input string to convert.
 * @returns The converted PascalCase string.
 * 
 * https://stackoverflow.com/a/53952925/16446474
 */
export function toPascalCase(str: string) {
   return `${str}`
      .toLowerCase()
      .replace(new RegExp(/[-_]+/, "g"), " ")
      .replace(new RegExp(/[^\w\s]/, "g"), "")
      .replace(
         new RegExp(/\s+(.)(\w*)/, "g"),
         ($1, $2, $3) => `${$2.toUpperCase() + $3}`
      )
      .replace(new RegExp(/\w/), (s) => s.toUpperCase());
}
