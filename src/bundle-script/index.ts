import generate from "@babel/generator";
import template from "@babel/template";
import { file, program } from "@babel/types";
import MapConverter from "convert-source-map";
import { Toypack } from "../Toypack.js";
import { DependencyGraph } from "../parse/index.js";
import {
   deconflict,
   transformToVars,
   UidGenerator,
} from "./link/index.js";
import { bindModules } from "./link/bind-modules.js";
import {
   cleanComments,
   createTransformContext,
   getSortedScripts,
} from "./utils";
import { Format } from "./formats/index.js";
import { resyncSourceMap } from "./utils/resync-source-map.js";
import runtime from "./runtime.js";

// TODO: remove
import { codeFrameColumns } from "@babel/code-frame";
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
   Format.esm(resultAst, scriptModules);

   const generated = generate(resultAst, {
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
      content: /* generated.code */"",
      map: MapConverter.fromObject(generated.map),
   };
}
