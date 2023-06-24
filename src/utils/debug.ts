import { LogLevelConfig } from "../types";

export function error(logLevel: LogLevelConfig, message: string) {
   if (logLevel == "error" || logLevel == "warn" || logLevel == "info") {
      console.error(message);
   }
}

export function warn(logLevel: LogLevelConfig, message: string) {
   if (logLevel == "warn" || logLevel == "info") {
      console.warn(message);
   }
}

export function info(logLevel: LogLevelConfig, message: string) {
   if (logLevel == "info") {
      console.info(message);
   }
}