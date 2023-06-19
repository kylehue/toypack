import { Plugin } from "../plugin/plugin.js";

const vuePlugin: Plugin = () => {
   let storedName: string = "";
   return {
      name: "vue-plugin",
      config() {
         return {
            bundle: {
               resolve: {
                  extensions: [".vue"]
               }
            }
         }
      },
      load(dep) {
         console.log(dep.source, "is imported by", this.getImporter()?.source, this.isEntry);
         if (
            dep.source == `virtual:${storedName}.test.js` ||
            dep.source == `virtual:${storedName}.hello.js`
         ) {
            return {
               type: "script",
               content: `console.log("${dep.source}");`,
            };
         }

         if (/\.vue$/.test(dep.source)) {
            
            storedName = dep.source;
            return {
               type: "script",
               content: `
import "virtual:${storedName}.style.scss";
import { render } from "virtual:${storedName}.hello.js";
import script from "virtual:${storedName}.test.js";

script.render = render;
script.__file = "${storedName}";
script.__scopeId = "xxxxxxxxx";

export default script;
`,
            };
         }
         
      },
   };
};

export default vuePlugin;
