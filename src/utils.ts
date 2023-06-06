import path from "path-browserify";

export function isLocal(pathStr: string) {
   return (
      /^(?:\.\.?(?:\/|$)|\/|([A-Za-z]:)?[/\\])/.test(pathStr) && !isURL(pathStr)
   );
}

const URL_RE = /https?:\/\/((?:[\w\d-]+\.)+[\w\d]{2,})/i;
const DATA_URL_RE = /^(data:)([\w\/\+-]*)(;charset=[\w-]+|;base64){0,1},(.*)/gi;
export function isURL(str: string) {
   return URL_RE.test(str) || DATA_URL_RE.test(str);
}

export function isJS(source: string) {
   return [".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx"].includes(
      path.extname(source)
   );
}

export function isCSS(source: string) {
   return [".css"].includes(
      path.extname(source)
   );
}

export function formatPath(from: string, to: string) {
   const parsed = path.parse(from);
   let result = to;
   for (let [property, value] of Object.entries(parsed)) {
      if (!to.includes(`[${property}]`)) continue;
      const propertyStr = `\\[${property}\\]`;
      const propertyRegex = new RegExp(propertyStr, "g");

      if (property == "root" || property == "dir") {
         value = `/${value}/`;
      }

      result = result.replace(propertyRegex, value );
   }

   result = path.join(result);

   return result;
}

/**
 * Get the target and the params of a URL.
 */
export function parseURLQuery(url: string) {
   const result = {
      target: "",
      params: {} as Record<string, any>
   };

   const split = url.split("?");
   result.target = split[0];
   const params = split[1]?.split("&") || [];

   for (const param of params) {
      const paramSplit = param.split("=");
      const paramKey = paramSplit[0];
      const paramValue = !paramSplit[1] ? true : paramSplit[1];

      result.params[paramKey] = paramValue;
   }

   return result;
}

/**
 * Generate a unique ID from a string.
 * @param str The string to get the unique ID from.
 * @returns
 */
export function getUniqueIdFromString(str: string): string {
   if (str.length === 0) {
      throw new Error("String must contain at least 1 character.");
   }

   let hash = 0;
   for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32-bit integer
   }
   const uniqueId = (hash >>> 0).toString(16); // Convert to positive hexadecimal
   return "m" + uniqueId;
}

/**
 * Encodes the given content to base64 format.
 */
export function btoa(content: string | ArrayBuffer) {
   if (typeof window !== "undefined" && typeof window.btoa === "function") {
      if (content instanceof ArrayBuffer) {
         return window.btoa(
            new Uint8Array(content).reduce(
               (data, byte) => data + String.fromCharCode(byte),
               ""
            )
         );
      }

      return window.btoa(unescape(encodeURIComponent(content)));
   } else {
      if (content instanceof ArrayBuffer) {
         return Buffer.from(new Uint8Array(content)).toString("base64");
      }

      return Buffer.from(content, "utf-8").toString("base64");
   }
}

/**
 * Finds the position of a code snippet within a source code string
 * while ignoring the whitespaces for each line.
 * @param sourceStr The source code string to search within.
 * @param searchStr The code snippet to search for.
 * @returns {Object} An object containing the zero-based line and
 * zero-based column position of the found code snippet. If the code
 * snippet is not found, the line and column will be -1.
 */
export function findCodePosition(sourceStr: string, searchStr: string) {
   const sourceLines = sourceStr.split("\n");
   const searchLines = searchStr.split("\n");
   let line = -1;
   let column = -1;

   for (let i = 0; i < sourceLines.length; i++) {
      const sourceLine = sourceLines[i].trim();

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
            column = sourceLines[i].indexOf(searchLines[0]?.trim());
         }
      }
   }

   return { line, column };
}

/**
 * Simple object check.
 */
function isObject(item: any) {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * Deep merge two objects.
 */
export function mergeDeep<T extends Object>(target: T, ...sources: T[]) {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        mergeDeep(target[key] as any, source[key]);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }

  return mergeDeep(target, ...sources);
}