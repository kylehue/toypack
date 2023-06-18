import { Plugin } from "../buildHooks.js";

const rawPlugin: Plugin = () => {
   return {
      name: "raw-plugin",
      load: {
         chaining: false,
         async: true,
         async handler(dep) {
            /** @todo parse source */
            if (!/\?raw$/.test(dep.source)) return;
            return {
               content: "console.log('raw plugin');",
            };
         },
      },
   };
};

export default rawPlugin;
