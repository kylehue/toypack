declare module "merge-source-map" {
   import { RawSourceMap } from "source-map-js";

   export default function (
      oldMap: RawSourceMap,
      newMap: RawSourceMap
   ): RawSourceMap;
}

declare module "babel-minify" {
   import { RawSourceMap } from "source-map-js";

   export interface Overrides {
      sourceMaps?: boolean;
      inputSourceMap?: RawSourceMap;
      comments?: Function | RegExp | boolean;
      babel?: any;
      minifyPreset?: any;
   }

   export default function (
      code: string,
      options?: Record<string, any>,
      overrides?: Overrides
   ): { code: string; map: RawSourceMap };
}
