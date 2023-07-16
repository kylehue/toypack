import MapConverter from "convert-source-map";
import { DependencyGraph, ScriptDependency } from "../graph/index.js";
import { Toypack } from "../Toypack.js";
import { TraverseMap } from "./TraverseMap.js";
import { deconflict } from "./deconflict.js";
import { addSourceCommentMarks } from "./add-source-comment-marks.js";
import { program, Node } from "@babel/types";
import generate from "@babel/generator";
import { Export } from "src/graph/extract-exports.js";
import { bindImports } from "./bind-imports.js";

function getAst(ast: Node) {
   return generate(ast, {
      comments: false,
   })?.code;
}

(window as any).getAst = getAst;

export async function bundleScript(this: Toypack, graph: DependencyGraph) {
   const traverseMap = new TraverseMap();
   const scriptModules = Object.values(graph).filter(
      (g): g is ScriptDependency => g.type == "script"
   );

   for (const script of scriptModules) {
      traverseMap.setAst(script.source, script.ast);
   }

   addSourceCommentMarks(traverseMap);
   deconflict(traverseMap);
   bindImports(scriptModules);
   traverseMap.doTraverseAll();

   const resultAst = program([]);

   for (const script of scriptModules) {
      // Object.values(imports).forEach((i) =>
      //    !i.path.removed ? i.path.remove() : {}
      // );
      // Object.values(exports).forEach((x) => removeExport(x));

      // t.addComment(
      //    chunk.ast.program.body[0],
      //    "leading",
      //    ` ${chunk.source.replace(/^\//, "")}`,
      //    true
      // );
      resultAst.body.unshift(...script.ast.program.body);
      // test += `\n\n// ${chunk.source.replace(/^\//, "")}\n`;
      // test += generate(chunk.ast, { comments: false }).code;
   }

   const generated = generate(resultAst);
   console.log(generated.code);

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

function removeExport(exported: Export) {
   if (exported.path.removed) return;
   if (
      exported.type == "aggregatedAll" ||
      exported.type == "aggregatedName" ||
      exported.type == "declared" ||
      exported.type == "aggregatedNamespace"
   ) {
      exported.path.remove();
   } else if (
      exported.type == "declaredDefault" ||
      exported.type == "declaredDefaultExpression"
   ) {
      exported.path.replaceWith(exported.declaration);
   }
}

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