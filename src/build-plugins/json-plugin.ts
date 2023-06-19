import { Plugin } from "../plugin/plugin.js";

const jsonPlugin: Plugin = () => {
   let content: string = "";
   return {
      name: "json-plugin",
      config() {
         return {
            bundle: {
               resolve: {
                  extensions: [".json"],
               },
            },
         };
      },
      load(this, dep) {
         if (dep.source == "virtual:hello.js") {
            return {
               type: "script",
               content: "export default " + content,
            };
         }

         //console.log(dep.source, "is imported by", this.test);
         if (!/\.json$/.test(dep.source)) return;
         content = dep.content as string;
         return {
            type: "script",
            //content: "export default " + dep.content,
            content: "export { default } from 'virtual:hello.js';",
         };
      },
   };
};

export default jsonPlugin;
