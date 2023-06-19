import { Plugin } from "../plugin/plugin.js";

const sassPlugin: Plugin = () => {
   return {
      name: "sass-plugin",
      load: {
         async: true,
         async handler(dep) {
            if (!/\.s[ac]ss$/.test(dep.source)) return;
            
            return {
               type: "style",
               content: "body { background-color: alicia; }",
            };
         },
      },
   };
};

export default sassPlugin;
