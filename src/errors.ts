export function anyError(reason: string) {
   return {
      code: 0,
      reason: reason,
   };
}

export function loaderNotFoundError(source: string) {
   return {
      code: 1,
      reason: `'${source}' is not supported. You might want to add a loader for this file type.`,
   };
}

export function assetNotFoundError(source: string) {
   return {
      code: 2,
      reason: `Asset '${source}' doesn't exist.`,
   };
}

export function assetStrictlyHTMLorJSError(source: string) {
   return {
      code: 3,
      reason: `Invalid entry asset '${source}'. Entry can only either be HTML or JS.`,
   };
}

export function resolveFailureError(source: string, parentSource: string) {
   return {
      code: 4,
      reason: `Could not resolve '${source}' at '${parentSource}'`,
   };
}

export function entryPointNotFoundError() {
   return {
      code: 5,
      reason: `Entry point not found.`,
   };
}

export function parseError(reason: string) {
   return {
      code: 6,
      reason: reason,
   };
}
