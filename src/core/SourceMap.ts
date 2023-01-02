import { getBtoa } from "@toypack/utils";
import mergeSourceMap from "merge-source-map";

export interface SourceMapData {
   version: number;
   sources: string[];
   names: string[];
   mappings: string;
   sourcesContent: string[];
   sourceRoot: string;
   file: string;
}

export default class SourceMap implements SourceMapData {
   public version: number = 3;
   public sources: string[] = [];
   public names: string[] = [];
   public mappings: string = "";
   public sourcesContent: string[] = [];
   public sourceRoot: string = "";
   public file: string = "";

   constructor(sourceMapData: Object = {}) {
      for (let [key, value] of Object.entries(sourceMapData)) {
         this[key] = value;
      }
   }

   toComment() {
      return "\n//# sourceMappingURL=" + this.toURL();
   }

   toString() {
      return JSON.stringify(this);
   }

   toBase64() {
      return getBtoa(this.toString());
   }

   toURL() {
      let base64 = this.toBase64();
      return "data:application/json;charset=utf-8;base64," + base64;
   }

   mergeWith(generated: any) {
      if (!generated) return this;
      if (this.mappings === generated.mappings) return this;

      let merged;
      if (!this.mappings) {
         merged = generated;
      } else {
         merged = mergeSourceMap(this, generated);
      }

      for (let [key, value] of Object.entries(merged)) {
         (this as SourceMapData)[key] = value;
      }

      return this;
   }
}
