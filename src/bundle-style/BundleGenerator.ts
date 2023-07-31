import { GenMapping, toEncodedMap } from "@jridgewell/gen-mapping";
import { SourceMapInput } from "@jridgewell/trace-mapping";
import { mergeSourceMapToBundle } from "../utils";

export class BundleGenerator {
   private _bundle = "";
   private _map: GenMapping | null = null;
   private _lastLine = 1;

   add(
      content: string,
      options?: {
         map?: SourceMapInput | null;
         moduleWrapperTemplates?: Record<string, string>;
         excludeWrap?: boolean;
      }
   ) {
      if (options?.map) {
         this._map ??= new GenMapping();

         mergeSourceMapToBundle(this._map, options.map, {
            line: this._lastLine,
            column: 0,
         });
      }

      this._bundle += content + "\n";
      this._lastLine += content.split("\n").length;
   }

   generate() {
      let content = this._bundle;

      return {
         content,
         map: this._map ? toEncodedMap(this._map) : null,
      };
   }
}
