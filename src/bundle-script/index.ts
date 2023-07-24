import { file, program, Node } from "@babel/types";
import generate from "@babel/generator";
import MapConverter from "convert-source-map";
import { Toypack } from "../Toypack.js";
import { ExportInfo } from "../parse/extract-exports.js";
import { DependencyGraph, ScriptDependency } from "../parse/index.js";
import { bindImports, deconflict, transformToVars } from "./link/index.js";
import {
   TraverseMap,
   cleanComments,
   createTransformContext,
   getSortedScripts,
   resetUidCache,
} from "./utils";
import { template } from "@babel/core";
import runtime from "./runtime.js";
import traverse, { Hub, NodePath, Scope } from "@babel/traverse";
import { codeFrameColumns } from "@babel/code-frame";

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

// function mergeAsts(scriptModules: ScriptDependency[]) {
//    const mergedAst = file(program([]));

//    for (const script of scriptModules) {
//       mergedAst.program.body.unshift(...script.ast.program.body);
//    }

//    let resultPath: NodePath<Program>;
//    traverse(mergedAst, {
//       Program(path) {
//          resultPath = path;
//          path.stop();
//       }
//    });

//    return resultPath!;
// }

export async function bundleScript(this: Toypack, graph: DependencyGraph) {
   const config = this.getConfig();
   const scriptModules = getSortedScripts(graph);
   const transform = createTransformContext();

   // order matters here
   resetUidCache();
   transformToVars(scriptModules);
   deconflict(scriptModules);
   bindImports(transform.context, graph, scriptModules);
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

   const generated = generate(resultAst, {
      sourceMaps: !!config.bundle.sourceMap,
      minified: config.bundle.mode == "production",
      comments: config.bundle.mode == "development",
   });

   console.log("%c-------------- RESULT --------------", "color:red;");

   console.log(getCode(generated.code));
   console.log(generated);

   // for (let i = 0; i < (generated?.map?.sources.length || 0); i++) {
   //    const source = generated?.map?.sources[i]!;
   //    generated.map!.sourcesContent ??= [];
   //    generated.map!.sourcesContent[i] = graph[source].asset.content as string;
   // }

   // console.log(
   //    generated.code + "\n" + MapConverter.fromObject(generated.map).toComment()
   // );

   return {
      content: "",
      map: MapConverter.fromObject({}),
   };
}
