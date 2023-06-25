import { Plugin } from "../types.js";
import { isUrl } from "../utils";

const importUrlPlugin: Plugin = () => {
   const urls: Record<string, string> = {};
   return {
      name: "import-url-plugin",
      resolve(id) {
         if (isUrl(id)) {
            const virtualId = `virtual:${id}.js`;
            urls[virtualId] = id;
            return virtualId;
         }
      },
      load: {
         async: true,
         async handler(dep) {
            if (dep.source in urls) {
               const response = await fetch(urls[dep.source]);
               const content = await response.text();
               
               return content;
            }
         },
      },
   };
};

export default importUrlPlugin;
