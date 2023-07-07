import path from "path-browserify";
import { SourceMapConfig } from "../types";

function testIncludeConfig(
   source: string,
   config: Exclude<SourceMapConfig["include"], undefined>
) {
   if (typeof config == "function") {
      return !!config(source);
   } else if (Array.isArray(config)) {
      for (const dir of config) {
         if (source.startsWith(path.join("/", dir))) {
            return true;
         }
      }
   } else {
      return config.test(source);
   }

   return false;
}

export function shouldProduceSourceMap(
   source: string,
   sourceMapConfig: SourceMapConfig | boolean
) {
   let result = true;
   if (typeof sourceMapConfig == "boolean") {
      return sourceMapConfig;
   }
   
   if (sourceMapConfig.exclude) {
      result = !testIncludeConfig(source, sourceMapConfig.exclude);
   }

   if (sourceMapConfig.include) {
      result = testIncludeConfig(source, sourceMapConfig.include);
   }

   return result;
}
