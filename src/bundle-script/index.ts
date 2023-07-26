import generate from "@babel/generator";
import template from "@babel/template";
import { file, program } from "@babel/types";
import MapConverter from "convert-source-map";
import { Toypack } from "../Toypack.js";
import { DependencyGraph } from "../parse/index.js";
import { deconflict } from "./link/deconflict.js";
import { transformToVars } from "./link/top-level-var.js";
import { UidGenerator } from "./link/UidGenerator.js";
import { bindModules } from "./link/bind-modules.js";
import { cleanComments } from "./utils/clean-comments.js";
import { createTransformContext } from "./utils/transform-context.js";
import { getSortedScripts } from "./utils/get-sorted-scripts.js";
import { resyncSourceMap } from "./utils/resync-source-map.js";
import { formatEsm } from "./formats/esm.js";
import runtime from "./runtime.js";

// TODO: remove
import { codeFrameColumns } from "@babel/code-frame";
import { TraverseMap } from "./utils/TraverseMap.js";
(window as any).getCode = function (ast: any) {
   return codeFrameColumns(
      typeof ast == "string"
         ? ast
         : generate(ast, {
              comments: false,
           })?.code,
      {
         start: {
            line: 0,
         },
      },
      {
         forceColor: true,
         highlightCode: true,
         linesAbove: 0,
         linesBelow: 999,
      }
   );
};

export async function bundleScript(this: Toypack, graph: DependencyGraph) {
   const config = this.getConfig();
   const scriptModules = getSortedScripts(graph);
   const transform = createTransformContext();
   const traverseMap = new TraverseMap();

   // order matters here
   UidGenerator.reset();
   transformToVars(scriptModules);
   deconflict(scriptModules);
   bindModules(transform.context, graph, scriptModules);
   cleanComments(scriptModules);

   // bundle
   const resultAst = file(program([]));

   for (const script of scriptModules) {
      resultAst.program.body.unshift(...script.ast.program.body);
   }

   for (const { ast } of transform.otherAsts) {
      resultAst.program.body.unshift(...ast.program.body);
   }

   for (const name of transform.runtimesUsed) {
      const statements = template.ast(runtime[name]);
      const arr = Array.isArray(statements) ? statements : [statements];
      resultAst.program.body.unshift(...arr);
   }

   // format
   formatEsm(resultAst, scriptModules);

   let generated = generate(resultAst, {
      sourceMaps: !!config.bundle.sourceMap,
      minified: config.bundle.mode == "production",
      comments: config.bundle.mode == "development",
   });

   if (generated.map) {
      // @ts-ignore mute readonly error
      generated.map = resyncSourceMap(generated.map, scriptModules);
   }

   console.log(getCode(generated.code));

   return {
      content: generated.code,
      map: MapConverter.fromObject(generated.map),
   };
}
