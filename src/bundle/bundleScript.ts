import { parse } from "@babel/parser";
import { CodeComposer, Toypack } from "../Toypack.js";
import { IDependencyGraph } from "../graph/index.js";
import { compileScript } from "./compileScript.js";
import { IParsedScript, IParsedStyle } from "../graph/parseAsset.js";

export async function bundleScript(this: Toypack, graph: IDependencyGraph) {
   const bundle = new CodeComposer();

   for (const dep of Object.values(graph)) {
      /** @todo create a better way to typeguard this */
      if (!this.hasExtension("script", dep.chunkSource)) continue;
      const dependency = dep as IParsedScript;
      
   }

   // for (const dep of Object.values(graph)) {
   //    if (dep.type == "resource") continue;
   //    const entryScript = dep.parsed.scripts[0];

   //    for (let i = dep.parsed.scripts.length - 1; i >= 0; i--) {
   //       const script = dep.parsed.scripts[i];

   //       if (true) {
   //          (entryScript.AST as any).program.body.unshift(parse(`import * as a from 'tesfesfasft';`, {
   //             sourceType: "module"
   //          }).program.body[0]);
   //       }

   //       const compiledScript = await compileScript.call(
   //          this,
   //          script.chunkSource,
   //          script.AST,
   //          dep.dependencyMap,
   //          script.map
   //       );

   //       console.log(compiledScript);
         
   //       //bundle.append(transpiled.code).breakLine();
   //    }
   // }

   console.log(bundle.toString());
}
