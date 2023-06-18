import {
   RawSourceMap,
   SourceMapConsumer,
   SourceMapGenerator,
} from "source-map-js";

export function isLocal(source: string) {
   if (
      source.startsWith("./") ||
      source.startsWith("../") ||
      source.startsWith("/")
   ) {
      return !isURL(source);
   }

   return false;
}

export function isNodeModule(source: string) {
   return /^\/?node_modules/.test(source);
}

const URL_RE = /https?:\/\/((?:[\w\d-]+\.)+[\w\d]{2,})/i;
const DATA_URL_RE = /^(data:)([\w\/\+-]*)(;charset=[\w-]+|;base64){0,1},(.*)/gi;
export function isURL(str: string) {
   return URL_RE.test(str) || DATA_URL_RE.test(str);
}

/**
 * Get the target and the params of a URL.
 */
export function parseURL(url: string) {
   const result = {
      target: "",
      params: {} as Record<string, string | boolean>,
      query: "",
   };

   const [target, queryString] = url.split("?");
   result.target = target;
   const params = queryString?.split("&") || [];

   if (!params.length) {
      return result;
   }

   for (const param of params) {
      const [paramKey, paramValue] = param.split("=");
      result.params[paramKey] = paramValue || true;
   }

   /**
    * Sort the params so that when we construct the query,
    * it will be the same as other queries with same value
    * but in different order.
    *
    * This is to avoid asset duplication when they are requested
    * with same queries but in different order.
    */
   const sortedParams = Object.entries(result.params)
      .sort(([keyA], [keyB]) => {
         // Sort keys alphabetically
         return keyA.localeCompare(keyB);
      })
      .sort(([, valueA], [, valueB]) => {
         // Sort values by type (boolean before string)
         const typeA = typeof valueA;
         const typeB = typeof valueB;
         if (typeA === "boolean" && typeB !== "boolean") {
            return -1;
         } else if (typeA !== "boolean" && typeB === "boolean") {
            return 1;
         } else {
            return 0;
         }
      });

   result.query = sortedParams
      .map(([key, value]) => {
         if (value === true) {
            return key;
         }

         return `${key}=${value}`;
      })
      .join("&");

   if (result.query) {
      result.query = "?" + result.query;
   }

   return result;
}

export function isValidSource(source: string) {
   return !/[\\:*?"<>]/.test(source);
}

/**
 * Generate a hash from string.
 */
export function getHash(str: string): string {
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

/**
 * Convert index to position object.
 * Line is 1-based and column is 0-based.
 */
export function indexToPosition(content: string, index: number) {
   if (index < 0) {
      throw new RangeError("The index must be greater than or equal to 0.");
   }

   let lines = content.substring(0, index).split("\n");
   let line = lines.length;
   let column = lines[lines.length - 1].length;
   return { line, column };
}

/**
 * Merge old source map and new source map and return merged.
 * If old or new source map value is falsy, return another one as it is.
 *
 * https://github.com/keik/merge-source-map
 */
export function mergeSourceMaps(oldMap: RawSourceMap, newMap: RawSourceMap) {
   if (!oldMap) return newMap;
   if (!newMap) return oldMap;

   const oldMapConsumer = new SourceMapConsumer(oldMap);
   const newMapConsumer = new SourceMapConsumer(newMap);
   const mergedMapGenerator = new SourceMapGenerator();

   // iterate on new map and overwrite original position of new map with one of old map
   newMapConsumer.eachMapping(function (map) {
      // pass when `originalLine` is null.
      // It occurs in case that the node does not have origin in original code.
      if (map.originalLine == null) return;

      const origPosInOldMap = oldMapConsumer.originalPositionFor({
         line: map.originalLine,
         column: map.originalColumn,
      });

      if (origPosInOldMap.source == null) return;

      mergedMapGenerator.addMapping({
         original: {
            line: origPosInOldMap.line,
            column: origPosInOldMap.column,
         },
         generated: {
            line: map.generatedLine,
            column: map.generatedColumn,
         },
         source: origPosInOldMap.source,
         name: origPosInOldMap.name,
      });
   });

   const consumers = [oldMapConsumer, newMapConsumer];
   consumers.forEach(function (consumer) {
      (consumer as any).sources.forEach(function (sourceFile: string) {
         if (sourceFile == "unknown") return;
         (mergedMapGenerator as any)._sources.add(sourceFile);
         const sourceContent = consumer.sourceContentFor(sourceFile);
         if (sourceContent != null) {
            mergedMapGenerator.setSourceContent(sourceFile, sourceContent);
         }
      });
   });

   (mergedMapGenerator as any)._sourceRoot = oldMap.sourceRoot;
   (mergedMapGenerator as any)._file = oldMap.file;

   return JSON.parse(mergedMapGenerator.toString()) as RawSourceMap;
}

// https://github.com/voodoocreation/ts-deepmerge
type TAllKeys<T> = T extends any ? keyof T : never;
type TIndexValue<T, K extends PropertyKey, D = never> = T extends any
   ? K extends keyof T
      ? T[K]
      : D
   : never;
type TPartialKeys<T, K extends keyof T> = Omit<T, K> &
   Partial<Pick<T, K>> extends infer O
   ? { [P in keyof O]: O[P] }
   : never;
type TFunction = (...a: any[]) => any;
type TPrimitives =
   | string
   | number
   | boolean
   | bigint
   | symbol
   | Date
   | TFunction;
type TMerged<T> = [T] extends [Array<any>]
   ? { [K in keyof T]: TMerged<T[K]> }
   : [T] extends [TPrimitives]
   ? T
   : [T] extends [object]
   ? TPartialKeys<{ [K in TAllKeys<T>]: TMerged<TIndexValue<T, K>> }, never>
   : T;

const isObject = (obj: any) => {
   if (typeof obj === "object" && obj !== null) {
      if (typeof Object.getPrototypeOf === "function") {
         const prototype = Object.getPrototypeOf(obj);
         return prototype === Object.prototype || prototype === null;
      }

      return Object.prototype.toString.call(obj) === "[object Object]";
   }

   return false;
};

interface IObject {
   [key: string]: any;
}

export const mergeDeep = <T extends IObject[]>(
   ...objects: T
): TMerged<T[number]> =>
   objects.reduce((result, current) => {
      if (Array.isArray(current)) {
         throw new TypeError(
            "Arguments provided to ts-deepmerge must be objects, not arrays."
         );
      }

      Object.keys(current).forEach((key) => {
         if (["__proto__", "constructor", "prototype"].includes(key)) {
            return;
         }

         if (Array.isArray(result[key]) && Array.isArray(current[key])) {
            result[key] = Array.from(
               new Set((result[key] as unknown[]).concat(current[key]))
            );
         } else if (isObject(result[key]) && isObject(current[key])) {
            result[key] = mergeDeep(
               result[key] as IObject,
               current[key] as IObject
            );
         } else {
            result[key] = current[key];
         }
      });

      return result;
   }, {}) as any;