import { Plugin } from "../types.js";
import { parseURL } from "../utils";

export default function (): Plugin {
   return {
      name: "raw-plugin",
      load: {
         chaining: false,
         handler(moduleInfo) {
            if (parseURL(moduleInfo.source).params.raw !== true) return;
            if (typeof moduleInfo.content != "string") {
               this.emitError("Blob contents are not supported.");
               return;
            }

            return {
               type: "script",
               content: this.getDefaultExportCode(`\`${moduleInfo.content}\``),
            };
         },
      },
   };
}
