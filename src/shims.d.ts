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

declare type CSSTreeGeneratedResult =
   | {
        css: string;
        map: import("source-map").SourceMapGenerator;
     }
   | string;

// TODO: remove
declare function getHighlightedCode(ast: import("@babel/types").Node): string;
declare function getHighlightedCode(code: string): string;
