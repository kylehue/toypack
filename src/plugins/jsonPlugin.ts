import { Plugin } from "../buildHooks.js";

const jsonPlugin: Plugin = () => {
   return {
      name: "json-plugin",
      load(dep) {
         if (!/\.ts$/.test(dep.source)) return;

         return {
            content: "console.log('json plugin');" + dep.content,
         };
         
      },
   };
};

export default jsonPlugin;
