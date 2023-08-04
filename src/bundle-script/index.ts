import generate from "@babel/generator";
import template from "@babel/template";
import { file, program } from "@babel/types";
import MapConverter from "convert-source-map";
import { deconflict } from "./link/deconflict.js";
import { transformToVars } from "./link/top-level-var.js";
import { bindModules } from "./link/bind-modules.js";
import { cleanComments } from "./utils/clean-comments.js";
import { resyncSourceMap } from "./utils/resync-source-map.js";
import { createNamespace } from "./utils/create-namespace.js";
import { formatEsm } from "./formats/esm.js";
import { ERRORS } from "../utils/index.js";
import runtime from "./runtime.js";
import type { Toypack, DependencyGraph } from "src/types";

// TODO: remove
import { codeFrameColumns } from "@babel/code-frame";
import { ScriptModule } from "src/types.js";
import { startRename } from "./utils/renamer.js";
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

export function getModules(graph: DependencyGraph) {
   return Object.values(Object.fromEntries(graph)).filter(
      (g): g is ScriptModule => g.isScript()
   );
}

export async function bundleScript(this: Toypack, graph: DependencyGraph) {
   const config = this.getConfig();
   const scriptModules = getModules(graph);
   const runtimesUsed = new Set<keyof typeof runtime>();
   this._uidGenerator.addReservedVars(...Object.keys(runtime));
   this._uidTracker.assignWithModules(this._uidGenerator, scriptModules);
   this._uidGenerator.addReservedVars(...this._uidTracker.getAllNamespaces());

   const resultAst = file(program([]));
   try {
      for (const module of scriptModules) {
         const isCached = !!this._getCache("compiled", module.source)?.module;
         if (!isCached || module.asset.modified) {
            this._pushToDebugger("verbose", `Compiling "${module.source}"...`);

            // order matters here
            transformToVars.call(this, module);
            deconflict.call(this, module);
            bindModules.call(this, graph, module);
            // module.ast.program.body = [{ type: "EmptyStatement" }];
            cleanComments(module);

            this._setCache("compiled", module.source, {
               module,
            });
         }
      }

      // Add all the modules first
      for (const module of scriptModules) {
         const cached = this._getCache("compiled", module.source);
         if (!cached?.module?.ast) continue;
         resultAst.program.body.unshift(...cached.module.ast.program.body);
      }

      // Then the namespaces (on top)
      for (const module of scriptModules) {
         if (!this._getCache("compiled", module.source)?.needsNamespace) {
            continue;
         }

         const statements = createNamespace.call(this, module);
         const arr = Array.isArray(statements) ? statements : [statements];
         resultAst.program.body.unshift(...arr);
         runtimesUsed.add("__export");
         cleanComments(module, arr);
      }

      // Lastly, the runtimes (on top)
      for (const name of runtimesUsed) {
         const statements = template.ast(runtime[name]);
         const arr = Array.isArray(statements) ? statements : [statements];
         resultAst.program.body.unshift(...arr);
      }

      // Format
      formatEsm.call(this, resultAst, scriptModules);
      for (const module of scriptModules) {
         startRename(module);
      }
   } catch (error: any) {
      this._pushToDebugger("error", ERRORS.bundle(error));
   }

   const generated = generate(resultAst, {
      sourceMaps: !!config.bundle.sourceMap,
      minified: config.bundle.mode == "production",
      comments: config.bundle.mode == "development",
   });

   if (generated.map) {
      // @ts-ignore mute readonly error
      generated.map = resyncSourceMap.call(this, generated.map, scriptModules);
   }

   // console.log(getCode(generated.code));

   return {
      content: generated.code,
      map: generated.map ? MapConverter.fromObject(generated.map) : null,
   };
}
