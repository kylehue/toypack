import { LogLevelConfig } from "../types";

export function error(logLevel: LogLevelConfig, fn: typeof console.error) {
   if (
      logLevel == "error" ||
      logLevel == "warn" ||
      logLevel == "info" ||
      logLevel == "debug"
   ) {
      return fn;
   }
}

export function warn(logLevel: LogLevelConfig, fn: typeof console.warn) {
   if (logLevel == "warn" || logLevel == "info" || logLevel == "debug") {
      return fn;
   }
}

export function info(logLevel: LogLevelConfig, fn: typeof console.info) {
   if (logLevel == "info" || logLevel == "debug") {
      return fn;
   }
}

export function debug(logLevel: LogLevelConfig, fn: typeof console.info) {
   if (logLevel == "debug") {
      return fn;
   }
}
