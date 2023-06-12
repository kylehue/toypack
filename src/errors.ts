export function anyError(reason: string) {
   return {
      code: 0,
      reason: reason,
   };
}

export function loaderNotFoundError(source: string) {
   return {
      code: 1,
      reason: `'${source}' contains contents that are not supported.`,
   };
}

export function assetNotFoundError(source: string) {
   return {
      code: 2,
      reason: `Asset '${source}' doesn't exist.`,
   };
}

export function resolveFailureError(source: string, parentSource: string) {
   return {
      code: 3,
      reason: `Could not resolve '${source}' at '${parentSource}'`,
   };
}

export function entryNotFoundError() {
   return {
      code: 4,
      reason: `Entry point not found.`,
   };
}

export function invalidEntryError(source: string) {
   return {
      code: 5,
      reason: `Invalid entry asset '${source}'. Make sure that it's a script or a stylesheet.`,
   };
}

export function parseError(reason: string) {
   return {
      code: 6,
      reason: reason,
   };
}
