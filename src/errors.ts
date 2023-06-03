export function loaderNotFoundError(source: string) {
   return {
      code: 0,
      reason: `'${source}' is not supported. You might want to add a loader for this file type.`,
   };
}

export function assetNotFoundError(source: string) {
   return {
      code: 1,
      reason: `Asset '${source}' doesn't exist.`,
   };
}

export function assetStrictlyHTMLorJSError(source: string) {
   return {
      code: 2,
      reason: `Invalid entry asset '${source}'. Entry can only either be HTML or JS.`,
   };
}

export function resolveFailureError(source: string, parentSource: string) {
   return {
      code: 3,
      reason: `Could not resolve '${source}' at '${parentSource}'`,
   };
}

export function entryPointNotFoundError() {
   return {
      code: 4,
      reason: `Entry point not found.`,
   };
}