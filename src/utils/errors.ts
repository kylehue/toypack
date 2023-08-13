import type { Error } from "../types";

export function any(reason: string): Error {
   return {
      code: 0,
      reason: reason,
   };
}

export function loadFailure(source: string): Error {
   return {
      code: 1,
      reason: `Failed to load '${source}'. You might want to add a plugin for this file type.`,
   };
}

export function assetNotFound(source: string): Error {
   return {
      code: 2,
      reason: `Asset '${source}' doesn't exist.`,
   };
}

export function resolveFailure(
   source: string,
   parentSource: string,
   codeFrame = ""
): Error {
   let reason = `Failed to resolve '${source}' in '${parentSource}'.`;
   if (codeFrame) {
      reason += "\n" + codeFrame;
   }
   return {
      code: 3,
      reason,
   };
}

export function entryNotFound(): Error {
   return {
      code: 4,
      reason: `Entry point not found.`,
   };
}

export function invalidEntry(source: string): Error {
   return {
      code: 5,
      reason: `Invalid entry asset '${source}'. Make sure that it's a script or a stylesheet.`,
   };
}

export function parse(reason: string): Error {
   return {
      code: 6,
      reason,
   };
}

export function bundle(reason: string): Error {
   return {
      code: 7,
      reason,
   };
}

export function invalidAssetSource(source: string): Error {
   return {
      code: 8,
      reason: `The source '${source}' is invalid because it contains characters that are not allowed.`,
   };
}

export function plugin(pluginName: string, reason: string): Error {
   return {
      code: 9,
      reason: `[${pluginName}] Error: ${reason}`,
   };
}

export function packageInstallFailure(
   packageSource: string,
   stack?: string
): Error {
   return {
      code: 10,
      reason: `Failed to install ${packageSource}. ${
         stack ? `\n\n${stack}` : ""
      }`,
   };
}
