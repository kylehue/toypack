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
