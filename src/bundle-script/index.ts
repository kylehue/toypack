import { file, program, Node } from "@babel/types";
import generate from "@babel/generator";
import MapConverter from "convert-source-map";
import { Toypack } from "../Toypack.js";
import { DependencyGraph } from "../parse/index.js";
import {
   bindModules,
   deconflict,
   transformToVars,
   UidGenerator,
} from "./link/index.js";
import {
   cleanComments,
   createTransformContext,
   getSortedScripts,
} from "./utils";
import { template } from "@babel/core";
import runtime from "./runtime.js";
import { Scope } from "@babel/traverse";
import { codeFrameColumns } from "@babel/code-frame";
import { Format } from "./formats/index.js";
import { resyncSourceMap } from "./utils/resync-source-map.js";

// TODO: remove
(window as any).getCode = function (ast: Node | string) {
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

// TODO: remove
(window as any).dumpReference = function (
   scope: Scope,
   name: string,
   source = "unknown",
   deepness: 1 | 2 | 3 = 1
) {
   console.log("%c" + "-".repeat(80), "color: red;");
   const binding = scope.getBinding(name);
   if (!binding) {
      console.log(
         `%cNo "${name}" binding found in "${source}".`,
         "color: grey"
      );
      console.log(scope);
      return;
   }

   if (!binding.referencePaths.length) {
      console.log(`%c"${name}" has no references in ${source}.`, "color: grey");
      console.log(scope);
      return;
   }

   console.log(
      `%cReference found:`,
      "color: orange",
      source,
      `(${binding.references})`
   );
   console.log(`Binding: "${name}"`);
   binding.referencePaths.forEach((path) => {
      const nodeToPrint =
         deepness == 1
            ? path.node
            : deepness == 2
            ? path.parent
            : deepness == 3
            ? path.parentPath?.node || path.parent
            : path.node;
      console.log(getCode(nodeToPrint));
   });
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
      const statements = template(runtime[name])();
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
      // @ts-expect-error mute readonly error
      generated.map = resyncSourceMap(generated.map, scriptModules);
   }

   // console.log("%c-------------- RESULT --------------", "color:red;");
   // console.log(getCode(generated.code));
   // console.log(generated);

   // console.log(
   //    generated.code + "\n" + MapConverter.fromObject(generated.map).toComment()
   // );

   return {
      content: generated.code,
      map: MapConverter.fromObject(generated.map),
   };
}
