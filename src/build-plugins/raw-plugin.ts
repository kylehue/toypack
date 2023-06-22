import { Plugin } from "../types.js";
import { parseURL } from "../utils";

const rawPlugin: Plugin = () => {
   return {
      name: "raw-plugin",
      loaders: [
         {
            test(source) {
               return parseURL(source).params.raw === true;
            },
            disableChaining: true,
            compile(dep) {
               return {
                  type: "script",
                  content: `export default \`${dep.content}\`;`,
               };
            },
         },
      ],
   };
};

export default rawPlugin;
