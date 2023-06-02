export function loaderNotFound(source: string) {
   return {
      code: 0,
      reason: `'${source}' is not supported. You might want to add a loader for this file type.`,
   };
}

export function assetNotFound(source: string) {
   return {
      code: 1,
      reason: `Asset '${source}' doesn't exist.`,
   };
}

export function assetStrictlyHTMLorJS(source: string) {
   return {
      code: 1,
      reason: `Invalid entry asset '${source}'. Entry can only either be HTML or JS.`,
   };
}