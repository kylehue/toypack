/**
 * Deeply merge all of the listed objects.
 * @param objects The objects to merge.
 * @returns The merged object.
 * 
 * https://github.com/voodoocreation/ts-deepmerge
 */
export const mergeObjects = <T extends IObject[]>(
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
            result[key] = mergeObjects(
               result[key] as IObject,
               current[key] as IObject
            );
         } else {
            result[key] = current[key];
         }
      });

      return result;
   }, {}) as any;

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
type TMerged<T> = [T] extends [any[]]
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

type IObject = Record<string, any>;