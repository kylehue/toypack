import { LogLevelConfig } from "../types";

export function error(logLevel: LogLevelConfig, message: string) {
   if (logLevel == "error") {
      console.error(message);
   }
}

export function warn(logLevel: LogLevelConfig, message: string) {
   if (logLevel == "error" || logLevel == "warn") {
      console.warn(message);
   }
}

export function info(logLevel: LogLevelConfig, message: string) {
   if (logLevel == "error" || logLevel == "warn" || logLevel == "info") {
      console.info(message);
   }
}