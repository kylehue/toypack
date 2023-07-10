import { LogLevelConfig } from "../types";

export function error(logLevel: LogLevelConfig, fn: typeof console.error) {
   if (logLevel == "error" || logLevel == "warn" || logLevel == "info") {
      return fn;
   }
}

export function warn(logLevel: LogLevelConfig, fn: typeof console.warn) {
   if (logLevel == "warn" || logLevel == "info") {
      return fn;
   }
}

export function info(logLevel: LogLevelConfig, fn: typeof console.info) {
   if (logLevel == "info") {
      return fn;
   }
}
