import generate from "@babel/generator";
import template from "@babel/template";
import { file, program } from "@babel/types";
import MapConverter from "convert-source-map";
import { DependencyGraph } from "../parse/index.js";
import { UidTracker } from "./link/UidTracker.js";
import { deconflict } from "./link/deconflict.js";
import { transformToVars } from "./link/top-level-var.js";
import { bindModules } from "./link/bind-modules.js";
import { cleanComments } from "./utils/clean-comments.js";
import { getSortedScripts } from "./utils/get-sorted-modules.js";
import { resyncSourceMap } from "./utils/resync-source-map.js";
import { createNamespace } from "./utils/create-namespace.js";
import { formatEsm } from "./formats/esm.js";
import { Toypack } from "../Toypack.js";
import { ERRORS } from "../utils/index.js";
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
   const runtimesUsed = new Set<keyof typeof runtime>();

   const resultAst = file(program([]));
   try {
      UidTracker.assignWithModules(scriptModules);
      for (const module of scriptModules) {
         if (
            !this._getCache("compiled", module.source) ||
            module.asset.modified
         ) {
            this._pushToDebugger("verbose", `Compiling "${module.source}"...`);

            // order matters here
            transformToVars(module);
            deconflict(module);
            bindModules.call(this, graph, module);
            cleanComments(module);

            this._setCache("compiled", module.source, {
               module,
            });
         }
      }

      // Bundle
      for (const module of scriptModules) {
         resultAst.program.body.unshift(...module.ast.program.body);
      }

      for (const module of scriptModules) {
         if (!this._getCache("compiled", module.source)?.needsNamespace) {
            continue;
         }

         const statements = createNamespace(module);
         const arr = Array.isArray(statements) ? statements : [statements];
         resultAst.program.body.unshift(...arr);
         runtimesUsed.add("__export");
      }

      for (const name of runtimesUsed) {
         const statements = template.ast(runtime[name]);
         const arr = Array.isArray(statements) ? statements : [statements];
         resultAst.program.body.unshift(...arr);
      }

      // Format
      formatEsm(resultAst, scriptModules);
   } catch (error: any) {
      this._pushToDebugger(
         "error",
         ERRORS.bundle(error.message || error)
      );
   }

   const generated = generate(resultAst, {
      sourceMaps: !!config.bundle.sourceMap,
      minified: config.bundle.mode == "production",
      comments: config.bundle.mode == "development",
   });

   if (generated.map) {
      // @ts-ignore mute readonly error
      generated.map = resyncSourceMap(generated.map, scriptModules);
   }

   // console.log(getCode(generated.code));

   return {
      content: generated.code,
      map: generated.map ? MapConverter.fromObject(generated.map) : null,
   };
}
