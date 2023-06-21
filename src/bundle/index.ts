import { Toypack } from "../Toypack.js";
import { DependencyGraph } from "../graph";
import { bundleScript } from "./bundle-script.js";

export async function bundle(this: Toypack, graph: DependencyGraph) {
   let script = await bundleScript.call(this, graph);

   console.log(script);
   
}