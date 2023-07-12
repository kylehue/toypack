import { Plugin } from "../types.js";
import { parseURL } from "../utils";

export default function (): Plugin {
   return {
      name: "raw-plugin",
      loaders: [
         {
            test(source) {
               return parseURL(source).params.raw === true;
            },
            disableChaining: true,
            compile(dep) {
               if (typeof dep.content != "string") {
                  this.emitError("Blob contents are not supported.");
                  return;
               }

               return {
                  type: "script",
                  content: this.getDefaultExportCode(`\`${dep.content}\``),
               };
            },
         },
      ],
   };
}
