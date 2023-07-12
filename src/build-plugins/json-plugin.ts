import { Plugin } from "../types.js";

export default function (): Plugin {
   return {
      name: "json-plugin",
      extensions: [["script", ".json"]],
      loaders: [
         {
            test: /\.json$/,
            compile(dep) {
               if (typeof dep.content != "string") {
                  this.emitError("Blob contents are not supported.");
                  return;
               }

               return this.getDefaultExportCode(dep.content);
            },
         },
      ],
   };
}
