import { Plugin } from "../types.js";
import { parseURL } from "../utils";

export default function (): Plugin {
   return {
      name: "raw-plugin",
      extensions: [["script", ".txt"]],
      load: {
         chaining: false,
         handler(moduleInfo) {
            const parsedRequest = parseURL(moduleInfo.source);
            if (
               parsedRequest.params.raw !== true &&
               !/\.txt$/.test(parsedRequest.target)
            ) {
               return;
            }

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
