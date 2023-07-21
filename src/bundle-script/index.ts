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
   resetUidCache();
   const traverseMap = new TraverseMap();
   const scriptModules = getSortedScripts(graph);

   for (const script of scriptModules) {
      traverseMap.setAst(script.source, script.ast);
   }

   const { context, runtimesUsed, otherAsts } = createTransformContext();

   // order matters here
   transformToVars(scriptModules);
   deconflict(scriptModules);
   bindImports(context, graph, scriptModules);
   cleanComments(scriptModules);

   // bindImports(context, graph);

   // bundle
   const resultAst = file(program([]));

   for (const script of scriptModules) {
      resultAst.program.body.unshift(...script.ast.program.body);
   }

   for (const { ast } of otherAsts) {
      resultAst.program.body.unshift(...ast.program.body);
   }

   for (const name of runtimesUsed) {
      const statements = template(runtime[name])();
      const arr = Array.isArray(statements) ? statements : [statements];
      resultAst.program.body.unshift(...arr);
   }

   const generated = generate(resultAst, {
      // sourceMaps: true
   });

   // for (let i = 0; i < (generated?.map?.sources.length || 0); i++) {
   //    const source = generated?.map?.sources[i]!;
   //    generated.map!.sourcesContent ??= [];
   //    generated.map!.sourcesContent[i] = graph[source].asset.content as string;
   // }

   console.log("%c-------------- RESULT --------------", "color:red;");
   console.log(getCode(generated.code));
   console.log(generated);

   // Deconflict.reset();
   // const config = this.getConfig();
   // const bundleGenerator = new BundleGenerator();

   // const moduleWrapper = getModuleWrapper();
   // bundleGenerator.setupModuleWrapper(moduleWrapper.head, moduleWrapper.foot);

   // const globalName = config.bundle.globalName;
   // bundleGenerator.setupWrapper(
   //    `${globalName ? `var ${globalName} = ` : ""}(function (){`,
   //    `})();`
   // );

   // bundleGenerator.add(requireFunction(), {
   //    excludeWrap: true,
   // });

   // this._pluginManager.triggerHook({
   //    name: "generateBundle",
   //    args: [
   //       {
   //          type: "script",
   //          generator: bundleGenerator,
   //       },
   //    ],
   //    context: {
   //       bundler: this,
   //    },
   // });

   // let returnCode = "null";

   // // compile entry
   // const entry = Object.values(graph).find(
   //    (m): m is ScriptDependency => m.type == "script" && m.isEntry
   // );
   // if (!entry) {
   //    throw new Error("Failed to bundle the graph: Entry point not found.");
   // }
   // const bundled = await bundleFromEntryPoint.call(this, graph, entry.source);

   // for (const source in graph) {
   //    const chunk = graph[source];
   //    if (chunk.type == "script") {
   //       const compiled = await compileScript.call(this, chunk, graph);
   //       console.log(compiled);

   //       traverse(compiled.ast!, {
   //          ImportDeclaration
   //       });

   //       // bundleGenerator.add(compiled.content, {
   //       //    map: compiled.map,
   //       //    moduleWrapperTemplates: {
   //       //       source: chunk.source,
   //       //       dependencyMap: JSON.stringify(chunk.dependencyMap)
   //       //    }
   //       // });
   //       if (chunk.isEntry) returnCode = requireCall(chunk.source);
   //    } else if (chunk.type == "resource") {
   //       bundleGenerator.add(
   //          `module.exports = "${getUsableResourcePath(
   //             this,
   //             chunk.asset.source
   //          )}";`,
   //          {
   //             moduleWrapperTemplates: {
   //                source: chunk.source,
   //                dependencyMap: "{}", // resources doesn't have deps
   //             },
   //          }
   //       );
   //    }
   // }

   // bundleGenerator.add(`\nreturn ${returnCode}`, {
   //    excludeWrap: true,
   // });

   // const bundle = bundleGenerator.generate();
   // const result = {
   //    content: bundle.content,
   //    map: bundle.map ? MapConverter.fromObject(bundle.map) : null,
   // };

   // if (config.bundle.mode == "production") {
   //    let { code, map } = babelMinify(
   //       result.content,
   //       {
   //          builtIns: false,
   //          ...config.babel.minify,
   //       },
   //       {
   //          sourceMaps: true,
   //          comments: false,
   //       }
   //    );

   //    if (result.map && map) {
   //       map = mergeSourceMaps(result.map.toObject(), map);
   //    }

   //    result.content = code;
   //    result.map = MapConverter.fromObject(map);
   // }

   // return result;

   return {
      content: "",
      map: MapConverter.fromObject({}),
   };
}

// function renameNodeIdentifier(
//    node: t.ClassDeclaration | t.FunctionDeclaration | t.VariableDeclaration,
//    newName: string,
//    oldName?: string
// ) {
//    if (t.isClassDeclaration(node)) {
//       node.id ??= t.identifier(newName);
//       node.id.name = newName;
//    } else if (t.isFunctionDeclaration(node)) {
//       node.id ??= t.identifier(newName);
//       node.id.name = newName;
//    } else {
//    }
// }

// function getIdentifiers(
//    node: t.ClassDeclaration | t.FunctionDeclaration | t.VariableDeclaration
// ) {
//    if (t.isClassDeclaration(node)) {
//       return [node.id];
//    } else if (t.isFunctionDeclaration(node)) {
//       return node.id ? [node.id] : [];
//    } else {
//       return node.declarations.map((d) => d.id);
//    }
// }

// function bindCompiledModules(compilations: Record<string, CompiledScript>) {
//    const modules = Object.values(compilations);
//    for (const module of modules) {
//       const { chunk, imports } = module;
//       for (const importInfo of Object.values(imports)) {
//          if (importInfo.type == "sideEffect") continue;
//          if (importInfo.type == "default") {
//             const exported = getExport(
//                compilations,
//                "default",
//                importInfo.source,
//                chunk.source
//             );
//             if (!exported) continue;
//             const importBind = importInfo.path.scope.getBinding(
//                importInfo.specifier.local.name
//             );
//             if (!importBind) continue;
//             // everything that referenced the default import
//             for (const imp of importBind.referencePaths) {
//                console.log(getAst(imp.node));

//                // exported.path.scope.registerBinding("const", imp);
//             }
//             exported.path.scope.registerBinding("const", importInfo.path);
//          } else if (importInfo.type == "specifier") {
//             const { specifier } = importInfo;
//             const { imported } = specifier;
//             const importedName =
//                imported.type == "Identifier" ? imported.name : imported.value;
//             const exported = getExport(
//                compilations,
//                importedName,
//                importInfo.source,
//                chunk.source
//             );

//             if (!exported) continue;
//             const importBind = importInfo.path.scope.getBinding(
//                importInfo.specifier.local.name
//             );
//             if (!importBind) continue;
//             // everything that referenced the default import
//             for (const imp of importBind.referencePaths) {
//                imp.scope.registerBinding("const", exported.path);
//             }
//          }
//       }
//    }
// }

/**
 * This function is for connecting each imported/exported identifiers
 * in all compiled script modules.
 */
// function connectCompiledModules(compilations: Record<string, CompiledScript>) {
//    for (const { chunk, imports } of Object.values(compilations)) {
//       for (const importInfo of Object.values(imports)) {
//          /**
//           * First, check if the module that is getting imported exists
//           * in the record of compiled scripts. If it doesn't exist, then
//           * it's probably a resource or style which we don't have to connect.
//           */
//          const resolvedImportSource = chunk.dependencyMap[importInfo.source];
//          const resolvedImportChunk = compilations[resolvedImportSource]?.chunk;
//          if (!resolvedImportChunk) continue;
//          if (importInfo.type == "specifier") {
//             const { local, imported } = importInfo.specifier;
//             const importedName =
//                imported.type == "Identifier" ? imported.name : imported.value;
//             const exported = getExport(
//                compilations,
//                importedName,
//                importInfo.source,
//                chunk.source
//             );
//             // TODO: consider other exported types
//             if (exported?.type != "declared") continue;
//             importInfo.path.scope.rename(local.name, exported.identifier.name);
//             // if (!importInfo.path.removed) importInfo.path.remove();
//             // removeExport(exported);
//          } else if (importInfo.type == "default") {
//             /**
//              * Add identifier to default imports
//              */
//             const { local } = importInfo.specifier;
//             const exportInfo = getExport(
//                compilations,
//                "default",
//                importInfo.source,
//                chunk.source
//             );
//             // TODO: consider declared default expressions
//             if (exportInfo?.type != "declaredDefault") continue;
//             const exportScope = exportInfo.path.scope;
//             const importScope = importInfo.path.scope;
//             exportScope.registerBinding("const", importInfo.path);
//             importScope.registerBinding("const", exportInfo.path);
//             importScope.getBinding(local.name)?.reference(exportInfo.path);
//             const uid = exportScope.generateUid(local.name);
//             renameNodeIdentifier(exportInfo.declaration, uid);
//             importScope.rename(local.name, uid);
//             // exportedScope.getBinding(local.name)?.reference(importInfo.path);
//             // make those reference each other
//             // first, we match their names

//             console.log(Object.keys(exportScope.bindings));
//             console.log(exportScope.bindings);

//             console.log(exportScope.getBinding("_adder5"));

//             exportScope
//                .getBinding(local.name)
//                ?.referencePaths.forEach((path) => {
//                   console.log(getAst(path.node));
//                });
//             console.log();

//             // then, we add
//             console.log(importScope.getBinding(local.name));
//             console.log(exportScope.getBinding(local.name));

//             // if (!importInfo.path.removed) importInfo.path.remove();
//             // removeExport(exported);
//          }
//       }
//    }
// }
