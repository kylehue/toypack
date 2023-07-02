import path from "path-browserify";
import { SourceMapConfig } from "../types";

export function shouldProduceSourceMap(
   source: string,
   sourceMapConfig: SourceMapConfig | boolean
) {
   if (typeof sourceMapConfig == "boolean") {
      return !!sourceMapConfig;
   }

   if (sourceMapConfig.include) {
      for (const dir of sourceMapConfig.include) {
         if (source.startsWith(path.join("/", dir))) {
            return true;
         }
      }

      return false;
   } else if (sourceMapConfig.exclude) {
      for (const dir of sourceMapConfig.exclude) {
         if (source.startsWith(path.join("/", dir))) {
            return false;
         }
      }

      return true;
   } else {
      return true;
   }
}
