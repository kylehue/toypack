import { DependencyGraph } from "../graph";
import { Toypack } from "../Toypack.js";
import { bundleScript } from "./bundle-script.js";

export async function bundle(this: Toypack, graph: DependencyGraph) {
   const script = await bundleScript.call(this, graph);

   console.log(script);
   
}