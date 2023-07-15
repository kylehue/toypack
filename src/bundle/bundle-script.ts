import babelMinify from "babel-minify";
import MapConverter from "convert-source-map";
import { DependencyGraph, ScriptDependency } from "../graph";
import { Toypack } from "../Toypack.js";
import { Deconflict, extractExports, getUsableResourcePath } from "../utils";
import { mergeSourceMaps } from "../utils/merge-source-maps.js";
import { compileScript } from "./compile-script.js";
import { requireFunction, requireCall, getModuleWrapper } from "./runtime.js";
import { BundleGenerator } from "../utils/BundleGenerator.js";
import { BabelFileResult, NodePath, template } from "@babel/core";
import { Export } from "../utils/extract-exports.js";
import { Import } from "../utils/extract-imports.js";
import * as t from "@babel/types";
import generate from "@babel/generator";

function viewAst(ast: t.Node) {
   console.log(
      generate(ast, {
         comments: false,
      })?.code
   );
}

(window as any).viewAst = viewAst;

export async function bundleScript(this: Toypack, graph: DependencyGraph) {
   Deconflict.reset();
   const config = this.getConfig();
   const bundleGenerator = new BundleGenerator();

   const moduleWrapper = getModuleWrapper();
   bundleGenerator.setupModuleWrapper(moduleWrapper.head, moduleWrapper.foot);

   const globalName = config.bundle.globalName;
   bundleGenerator.setupWrapper(
      `${globalName ? `var ${globalName} = ` : ""}(function (){`,
      `})();`
   );

   bundleGenerator.add(requireFunction(), {
      excludeWrap: true,
   });

   this._pluginManager.triggerHook({
      name: "generateBundle",
      args: [
         {
            type: "script",
            generator: bundleGenerator,
         },
      ],
      context: {
         bundler: this,
      },
   });

   let returnCode = "null";

   // compile entry
   const entry = Object.values(graph).find(
      (m): m is ScriptDependency => m.type == "script" && m.isEntry
   );
   if (!entry) {
      throw new Error("Failed to bundle the graph: Entry point not found.");
   }
   const bundled = await bundleFromEntryPoint.call(this, graph, entry.source);

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

   bundleGenerator.add(`\nreturn ${returnCode}`, {
      excludeWrap: true,
   });

   const bundle = bundleGenerator.generate();
   const result = {
      content: bundle.content,
      map: bundle.map ? MapConverter.fromObject(bundle.map) : null,
   };

   if (config.bundle.mode == "production") {
      let { code, map } = babelMinify(
         result.content,
         {
            builtIns: false,
            ...config.babel.minify,
         },
         {
            sourceMaps: true,
            comments: false,
         }
      );

      if (result.map && map) {
         map = mergeSourceMaps(result.map.toObject(), map);
      }

      result.content = code;
      result.map = MapConverter.fromObject(map);
   }

   return result;
}

interface CompiledScript {
   chunk: ScriptDependency;
   compiled: BabelFileResult;
   exports: Record<string, Export>;
   imports: Record<string, Import>;
}

async function getAllCompiledScript(this: Toypack, graph: DependencyGraph) {
   const result: Record<string, CompiledScript> = {};

   for (const chunk of Object.values(graph)) {
      if (chunk.type != "script") continue;
      const { compiled, extractedExports, extractedImports } =
         await compileScript.call(this, chunk, graph);

      result[chunk.source] = {
         chunk,
         compiled,
         exports: extractedExports,
         imports: extractedImports,
      };
   }

   return result;
}

function getExport(
   compilations: Record<string, CompiledScript>,
   importName: string,
   importSource: string,
   importerSource: string
): Export | null {
   const resolvedImportSource =
      compilations[importerSource].chunk.dependencyMap[importSource];
   const resolvedImport = compilations[resolvedImportSource];
   let exported: Export | null = resolvedImport.exports[importName];
   if (!exported) {
      /**
       * If export is not found, try if it's in any of the
       * aggregated star exports e.g.
       * export * from "./module.js";
       */
      for (const exportInfo of Object.values(resolvedImport.exports)) {
         if (exportInfo.type != "aggregatedAll") continue;
         exported = getExport(
            compilations,
            importName,
            exportInfo.source,
            resolvedImport.chunk.source
         );
      }
   }

   if (exported && exported.type == "aggregatedName") {
      /**
       * Recurse until we get the exported declaration if it's aggregated.
       */
      return getExport(
         compilations,
         importName,
         exported.source,
         resolvedImport.chunk.source
      );
   }

   return exported;
}

function renameId(
   node: t.ClassDeclaration | t.FunctionDeclaration | t.VariableDeclaration,
   newName: string,
   oldName?: string
) {
   if (t.isClassDeclaration(node)) {
      node.id ??= t.identifier(newName);
      node.id.name = newName;
   } else if (t.isFunctionDeclaration(node)) {
      node.id ??= t.identifier(newName);
      node.id.name = newName;
   } else {
   }
}

function getIdentifiers(
   node: t.ClassDeclaration | t.FunctionDeclaration | t.VariableDeclaration
) {
   if (t.isClassDeclaration(node)) {
      return [node.id];
   } else if (t.isFunctionDeclaration(node)) {
      return node.id ? [node.id] : [];
   } else {
      return node.declarations.map((d) => d.id);
   }
}

function bindCompiledModules(compilations: Record<string, CompiledScript>) {
   const modules = Object.values(compilations);
   for (const module of modules) {
      const { chunk, imports } = module;
      // for (const importInfo of Object.values(imports)) {
      //    if (importInfo.type == "sideEffect") continue;
      //    if (importInfo.type == "default") {
      //       const exported = getExport(
      //          compilations,
      //          "default",
      //          importInfo.source,
      //          chunk.source
      //       );
      //       if (!exported) continue;
      //       const importBind = importInfo.path.scope.getBinding(
      //          importInfo.specifier.local.name
      //       );
      //       if (!importBind) continue;
      //       // everything that referenced the default import
      //       for (const imp of importBind.referencePaths) {
      //          imp.scope.registerBinding("const", exported.path);
      //       }
      //    } else if (importInfo.type == "specifier") {
      //       const { specifier } = importInfo;
      //       const { imported } = specifier;
      //       const importedName =
      //          imported.type == "Identifier" ? imported.name : imported.value;
      //       const exported = getExport(
      //          compilations,
      //          importedName,
      //          importInfo.source,
      //          chunk.source
      //       );
      //       if (!exported) continue;
      //       const importBind = importInfo.path.scope.getBinding(
      //          importInfo.specifier.local.name
      //       );
      //       if (!importBind) continue;
      //       // everything that referenced the default import
      //       for (const imp of importBind.referencePaths) {
      //          imp.scope.registerBinding("const", exported.path);
      //       }
      //    }
      // }
   }
}

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
      // exported.path.replaceWith(exported.declaration);
   }
}

/**
 * Removes aliases and adds identifiers to default exports.
 */
function fixCompiledModules(compilations: Record<string, CompiledScript>) {
   for (const { chunk, imports, compiled } of Object.values(compilations)) {
      for (const importInfo of Object.values(imports)) {
         /**
          * Skipped:
          * First, check if the module that is getting imported exists
          * in the record of compiled scripts.
          * If it doesn't exist, then it's probably a resource or style
          * which we don't have to connect.
          */
         const resolvedImportSource = chunk.dependencyMap[importInfo.source];
         const resolvedImportChunk = compilations[resolvedImportSource]?.chunk;
         if (!resolvedImportChunk) continue;
         if (importInfo.type == "specifier") {
            /**
             * Rename back to imported name (remove alias).
             */
            // const { local, imported } = importInfo.specifier;
            // if (imported.type == "StringLiteral") {
            //    const exported = getExport(
            //       compilations,
            //       imported.value,
            //       importInfo.source,
            //       chunk.source
            //    );
            //    if (exported?.type != "declared") continue;
            //    importInfo.path.scope.rename(
            //       local.name,
            //       exported.identifier.name
            //    );
            // } else {
            //    // simple alias removal
            //    importInfo.path.scope.rename(local.name, imported.name);
            // }
            const { local, imported } = importInfo.specifier;
            const importedName =
               imported.type == "Identifier" ? imported.name : imported.value;
            const exported = getExport(
               compilations,
               importedName,
               importInfo.source,
               chunk.source
            );
            // TODO: consider other exported types
            if (exported?.type != "declared") continue;
            importInfo.path.scope.rename(local.name, exported.identifier.name);
            // if (!importInfo.path.removed) importInfo.path.remove();
            // removeExport(exported);
         } else if (importInfo.type == "default") {
            /**
             * Add identifier to default imports
             */
            const { local } = importInfo.specifier;
            const exported = getExport(
               compilations,
               "default",
               importInfo.source,
               chunk.source
            );
            // TODO: consider declared default expressions
            if (exported?.type != "declaredDefault") continue;
            const uid = exported.path.scope.generateUid(local.name);
            exported.path.scope.registerBinding("const", importInfo.path);
            renameId(exported.declaration, uid);
            importInfo.path.scope.rename(local.name, uid);
            // if (!importInfo.path.removed) importInfo.path.remove();
            // removeExport(exported);
         }
      }
   }
}

async function bundleFromEntryPoint(
   this: Toypack,
   graph: DependencyGraph,
   entrySource: string
) {
   const resultAst = t.program([]);

   const compilations = await getAllCompiledScript.call(this, graph);
   const compiledEntry = compilations[entrySource];
   console.log(compilations);
   bindCompiledModules(compilations);
   fixCompiledModules(compilations);

   for (const { chunk } of Object.values(compilations).reverse()) {
      console.log("//" + chunk.source);
      viewAst(chunk.ast);
   }

   const addToBody = (...statements: t.Statement[]) => {
      resultAst.body.unshift(...statements);
   };

   // const recurse = (entry: CompiledScript) => {
   //    // Get imports
   //    for (const importInfo of Object.values(entry.imports)) {
   //       const resolvedSource = entry.chunk.dependencyMap[importInfo.source];
   //       const resolvedChunk = compilations[resolvedSource];
   //       // remove import
   //       if (!importInfo.path.removed) {
   //          importInfo.path.remove();
   //       }

   //       // it's probably a resource or a css asset if it's not resolved
   //       if (!resolvedChunk) {
   //          // console.log("unresolved", resolvedSource);
   //          continue;
   //       }

   //       if (importInfo.type == "specifier") {
   //          console.log("%cimportInfo:", "color: yellow;", importInfo);
   //          const exportInfo = getExport(
   //             compilations,
   //             importInfo.imported,
   //             importInfo.source,
   //             entry.chunk.source
   //          );
   //          if (exportInfo?.type == "declared") {
   //             console.log("%cexportInfo:", "color: orange;", exportInfo);
   //             exportInfo.path.scope.rename(
   //                importInfo.name,
   //                importInfo.imported
   //             );
   //             addToBody(exportInfo.declaration);

   //             console.log("%cCode:", "color: green");
   //             viewAst(exportInfo.declaration);
   //          }
   //       }

   //       recurse(resolvedChunk);
   //    }

   //    // add the rest of the body
   //    // resultAst.program.body.push(
   //    //    t.expressionStatement(t.stringLiteral(`-----------------${entry.chunk.source}-----------------`))
   //    // );
   //    // resultAst.program.body.push(...entry.compiled.ast!.program.body.reverse());
   // };

   // recurse(compiledEntry);

   //console.log(result);

   console.log("%c---------RESULT----------", "color: red;");
   viewAst(resultAst);

   // const recurse = async (entry: ScriptDependency) => {
   //    const compiled = await compileScript.call(this, entry, graph);
   //    const ast = compiled.ast!;

   //    traverse(ast, {
   //       ImportDeclaration(path) {
   //          const { node } = path;
   //          const request = node.source.value;
   //          const resolvedRequest = entry.dependencyMap[request];
   //          const resolvedModule = graph[resolvedRequest];
   //          console.log(resolvedRequest);
   //          // TODO: acknowledge styles and resources
   //          if (resolvedModule.type != "script") return;
   //          path.traverse({
   //             ImportSpecifier(path) {},
   //             ImportDefaultSpecifier(_path) {
   //                // [1] get the default export from `resolvedModule`
   //                // [2]
   //             },
   //             ImportNamespaceSpecifier() {},
   //          });
   //          console.log(path.remove());
   //       },
   //       Identifier() {},
   //    });

   //    const generated = transformFromAstSync(ast, entry.content, {
   //       comments: false,
   //    });
   //    console.log(generated);
   // };

   // await recurse(entry);
}
