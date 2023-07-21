declare module "babel-minify" {
   import { EncodedSourceMap } from "@jridgewell/gen-mapping";

   export interface Overrides {
      sourceMaps?: boolean;
      inputSourceMap?: EncodedSourceMap;
      comments?: Function | RegExp | boolean;
      babel?: any;
      minifyPreset?: any;
   }

   export default function (
      code: string,
      options?: Record<string, any>,
      overrides?: Overrides
   ): { code: string; map: EncodedSourceMap };
}

// TODO: remove
declare function dumpReference(
   scope: Scope,
   name: string,
   source?: string,
   deepness?: number
): void;

declare function getCode(
   ast: any
): string;