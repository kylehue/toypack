import { Toypack } from "../Toypack.js";
import { DependencyGraph } from "../types";
import { bundleScript } from "./bundle-script.js";
import { bundleStyle } from "./bundle-style.js";

export async function bundle(this: Toypack, graph: DependencyGraph) {
   const script = await bundleScript.call(this, graph);
   const style = await bundleStyle.call(this, graph);

   console.log(script, style);
}