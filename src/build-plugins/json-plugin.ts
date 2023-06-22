import { Plugin } from "../types.js";

const jsonPlugin: Plugin = () => {
   return {
      name: "json-plugin",
      extensions: [["script", ".json"]],
      loaders: [
         {
            test: /\.json$/,
            compile: (dep) => "export default " + dep.content,
         },
      ],
   };
};

export default jsonPlugin;
