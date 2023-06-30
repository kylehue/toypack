import { Plugin } from "../types.js";

const jsonPlugin: Plugin = () => {
   return {
      name: "json-plugin",
      extensions: [["script", ".json"]],
      loaders: [
         {
            test: /\.json$/,
            compile(dep) {
               if (typeof dep.content != "string") {
                  this.error("Blob contents are not supported.");
                  return;
               }
               
               return this.getDefaultExportCode(dep.content);
            },
         },
      ],
   };
};

export default jsonPlugin;
