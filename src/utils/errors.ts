export function any(reason: string) {
   return {
      code: 0,
      reason: reason,
   };
}

export function loaderNotFound(source: string) {
   return {
      code: 1,
      reason: `Failed to load '${source}'.`,
   };
}

export function assetNotFound(source: string) {
   return {
      code: 2,
      reason: `Asset '${source}' doesn't exist.`,
   };
}

export function resolveFailure(
   source: string,
   parentSource: string,
   codeFrame = ""
) {
   let reason = `Failed to resolve '${source}' from '${parentSource}'`;
   if (codeFrame) {
      reason += "\n" + codeFrame;
   }
   return {
      code: 3,
      reason,
   };
}

export function entryNotFound() {
   return {
      code: 4,
      reason: `Entry point not found.`,
   };
}

export function invalidEntry(source: string) {
   return {
      code: 5,
      reason: `Invalid entry asset '${source}'. Make sure that it's a script or a stylesheet.`,
   };
}

export function parse(reason: string) {
   return {
      code: 6,
      reason: reason,
   };
}

export function invalidAssetSource(source: string) {
   return {
      code: 7,
      reason: `The source '${source}' is invalid because it contains characters that are not allowed.`,
   };
}

export function plugin(pluginName: string, reason: string) {
   return {
      code: 8,
      reason: `[${pluginName}] Error: ${reason}`,
   };
}

export function packageInstallFailure(
   name: string,
   version: string,
   stack?: string
) {
   return {
      code: 9,
      reason: `Failed to install ${name}@${version}. ${
         stack ? `\n\n${stack}` : ""
      }`,
   };
}
