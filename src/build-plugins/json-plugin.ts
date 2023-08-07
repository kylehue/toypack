import { Plugin } from "../types.js";

export default function (): Plugin {
   return {
      name: "json-plugin",
      extensions: [["script", ".json"]],
      load(moduleInfo) {
         if (!/\.json$/.test(moduleInfo.source.split("?")[0])) return;
         if (typeof moduleInfo.content != "string") {
            this.emitError("Blob contents are not supported.");
            return;
         }

         return this.getDefaultExportCode(moduleInfo.content);
      },
   };
}
