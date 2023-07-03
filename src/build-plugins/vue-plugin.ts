import { Loader, Plugin } from "../types.js";

export default function (): Plugin {
   let sources: any = {};
   const vueLoader: Loader = {
      test: /\.vue$/,
      compile(dep) {
         const mocks: Record<string, string> = {};
         mocks[`virtual:${dep.source}.style.scss`] = `
body {
   content: "sass from vue!";
}
`;
         mocks[`virtual:${dep.source}.test.js`] = `
const script = {
   template: ""
};

export default script;
`;
         mocks[`virtual:${dep.source}.hello.ts`] = `
export function render() {
   console.log("render!");
}
`;
         sources = mocks;
         return `
import "virtual:${dep.source}.style.scss";
import { render } from "virtual:${dep.source}.hello.ts";
import script from "virtual:${dep.source}.test.js";

script.render = render;
script.__file = "${dep.source}";
script.__scopeId = "xxxxxxxxx";

export default script;
`;
      },
   };

   return {
      name: "vue-plugin",
      extensions: [["script", ".vue"]],
      loaders: [vueLoader],
      buildStart() {},
      load(dep) {
         if (dep.source in sources) {
            return sources[dep.source];
         }
      },
      transform(ctx) {
         if (ctx.type != "script") return;
      },
   };
}
