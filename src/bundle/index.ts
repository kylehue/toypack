import { IDependencyGraph } from "../graph/index.js";
import { Toypack } from "../Toypack.js";
import { bundleScript } from "./bundleScript.js";

export async function bundle(this: Toypack, graph: IDependencyGraph) {
   const outputFilename = "index";

   const result = {
      resources: [],
      js: {
         source: outputFilename + ".js",
         content: "",
      },
      css: {
         source: outputFilename + ".css",
         content: "",
      },
      html: {
         source: outputFilename + ".html",
         content: "",
      },
   };

   const mode = this.options.bundleOptions.mode;
   const script = await bundleScript.call(this, graph);

   return result;
}