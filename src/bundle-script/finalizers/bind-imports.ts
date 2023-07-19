import { DependencyGraph, ScriptDependency } from "src/graph";
import { ImportInfo } from "src/graph/extract-imports";
import {
   AggregatedNamespaceExport,
   ExportInfo,
} from "src/graph/extract-exports";
import { getExport } from "../utils/get-export";
import {
   ImportSpecifier,
   ClassDeclaration,
   FunctionDeclaration,
   Identifier,
   StringLiteral,
   Program,
   identifier,
   variableDeclaration,
   variableDeclarator,
   file,
   program,
} from "@babel/types";
import traverse, { NodePath, Scope } from "@babel/traverse";
import { template } from "@babel/core";
import { getSortedScripts } from "../utils/get-sorted-scripts";
import path from "path-browserify";
import runtime from "../runtime";
import { TransformContext } from "../utils/transform-context";
import { generateUid } from "../utils";

function getImportedName(specifier: ImportSpecifier) {
   const { imported } = specifier;
   return imported.type == "Identifier" ? imported.name : imported.value;
}

/**
 * Gets all the modules that imported the provided import name.
 */
function getImportersOfName(
   graph: DependencyGraph,
   importSource: string,
   importName: string
) {
   const result: {
      module: ScriptDependency;
      importInfo: ImportInfo;
   }[] = [];
   for (const module of Object.values(graph)) {
      if (module.type != "script") continue;
      const imported: ImportInfo | null = module.imports[importName];
      if (!imported) continue;
      const resolvedImportedSource = module.dependencyMap[imported.source];
      if (resolvedImportedSource == importSource) {
         result.push({
            module,
            importInfo: imported,
         });
      }
   }

   return result;
}

/**
 * Gets all the modules that aggregately exported the provided source as
 * a namespace.
 *
 * For example the provided source is "/main.js":
 *
 * If a module has a `export * as namespace from "/main.js";` in its code,
 * then that module will be in the returned array.
 */
function getAggregateNamespaceExports(graph: DependencyGraph, source: string) {
   const result: {
      module: ScriptDependency;
      exportInfo: AggregatedNamespaceExport;
   }[] = [];

   for (const module of Object.values(graph)) {
      if (module?.type != "script") continue;
      if (module.source == source) continue;
      const exportInfo = Object.values(module.exports).find((x) => {
         if (x.type != "aggregatedNamespace") return false;
         const resolvedExportSource = module.dependencyMap[x.source];
         return resolvedExportSource == source;
      });
      if (exportInfo?.type != "aggregatedNamespace") continue;
      if (exportInfo) {
         result.push({
            module,
            exportInfo,
         });
      }
   }

   return result;
}

/**
 * Adds identifier for functions that doesn't have names. Specifically
 * used for default exports that don't have names like:
 * - `export default function () { ... }`
 * - `export default class { ... }`
 */
function setExportDefaultIdentifier(
   node: ClassDeclaration | FunctionDeclaration,
   newName: string
) {
   if (node.type == "ClassDeclaration") {
      node.id ??= identifier(newName);
      node.id.name = newName;
   } else {
      node.id ??= identifier(newName);
      node.id.name = newName;
   }
}

/**
 * This method references the export to import.
 *
 * In the code below, the declaration of `foo` in "module.js" will have
 * a reference to the `foo` inside `console.log(foo);` in "main.js".
 * ```js
 * // module.js
 * export const foo = "bar";
 *
 * // main.js
 * import { foo } from "./module.js";
 * console.log(foo);
 * ```
 */
function referenceExportToImport(
   importInfo: ImportInfo,
   exportInfo: ExportInfo,
   nameToReference: string
) {
   const exportScope = exportInfo.path.scope;
   const importScope = importInfo.path.scope;
   const exportedBinding = exportScope.getBinding(nameToReference);
   const importedBinding = importScope.getBinding(nameToReference);
   importedBinding?.referencePaths.forEach((path) => {
      exportedBinding?.reference(path);
   });

   // dereference the export declarations
   exportedBinding?.referencePaths.forEach((path, index) => {
      if (path.findParent((x) => x.isExportDeclaration())) {
         exportedBinding?.dereference();
         exportedBinding?.referencePaths.splice(index, 1);
      }
   });
}

const exportDeclarationUIDMap = new Map<string, string>();
/** Gets the assigned UID of the exported declaration. */
function getExportUid(exportInfo: ExportInfo, name?: string) {
   let uid = exportDeclarationUIDMap.get(exportInfo.id);
   if (!uid) {
      uid = generateUid(name);
      exportDeclarationUIDMap.set(exportInfo.id, uid);
   }

   return uid;
}

/**
 * This function gets the module that was aggregated by the imported
 * module e.g.
 *
 * ```js
 * // main.js --> The `importer`
 * import { Aggregated } from "./some-module.js";
 * // This import is the `importInfo`
 *
 * // some-module.js --> The imported module
 * export * as Aggregated from "./aggregated.js";
 * // This export is the `exportInfo`
 *
 * // aggregated.js --> Function's result
 * export const foo = "bar";
 * ```
 */
function getAggregatedModule(
   graph: DependencyGraph,
   importer: ScriptDependency,
   importInfo: ImportInfo,
   exportInfo: AggregatedNamespaceExport
) {
   const a = importer.dependencyMap[importInfo.source];
   const b = graph[a];
   if (b?.type != "script") return;
   const c = b.dependencyMap[exportInfo.source];
   const d = graph[c];
   if (d?.type != "script") return;
   return d;
}

const namespaceExportsMap = new Map<string, string>();

/**
 * This function declares an object that contains all of the exports
 * of the provided module e.g.
 *
 * In:
 * ```js
 * // main.js
 * export const foo = "bar";
 * export const bar = "foo";
 * ```
 * Out:
 * ```js
 * var namespace = {};
 * __export(namespace, {
 *    foo: () => foo,
 *    bar: () => bar
 * });
 *
 * ...
 * ```
 *
 * @returns The namespace id.
 */
function getOrCreateNamespace(
   context: TransformContext,
   module: ScriptDependency,
   path: NodePath,
   namespace: string
) {
   const declared = namespaceExportsMap.get(module.source);
   if (declared) {
      return declared;
   }

   const exportEntries = Object.entries(module.exports);
   const computedIdsMap = new Map<string, Identifier>();
   const formattedExports = exportEntries
      .map(([exportName, exportInfo], index, arr) => {
         if (
            exportInfo.type !== "declared" &&
            exportInfo.type !== "declaredDefault"
         ) {
            return;
         }

         const computedIdKey = `COMP_${index}`;
         computedIdsMap.set(computedIdKey, exportInfo.identifier);
         let line = `${exportName}: () => ${computedIdKey}`;
         return line;
      })
      .join(",\n");

   const buildTemplate = template(`
      var ID = {};
      __export(ID, {\n${formattedExports}\n});
   `);

   const replacements: any = { ID: namespace };
   for (const [key, val] of computedIdsMap) {
      replacements[key] = val;
   }

   const builtTemplate = buildTemplate(replacements);
   context.addRuntime("__export");
   context.unshiftAst(builtTemplate, module.source);

   namespaceExportsMap.set(module.source, namespace);
   return namespace;
}

/**
 * Binds the imported module to the exported declarations.
 */
function bindExported(
   context: TransformContext,
   graph: DependencyGraph,
   script: ScriptDependency,
   importInfo: ImportInfo,
   exportInfo: ExportInfo,
   importName: string,
   importLocalName: string,
   isImportedAsNamespace = false
) {
   const exportScope = exportInfo.path.scope;
   const importScope = importInfo.path.scope;
   const isAlreadyDeclared = !!exportDeclarationUIDMap.get(exportInfo.id);
   if (exportInfo.type == "declared" || exportInfo.type == "declaredDefault") {
      const uid = getExportUid(exportInfo, importLocalName);
      exportScope.rename(exportInfo.identifier.name, uid);
      importScope.rename(importLocalName, uid);

      if (exportInfo.declaration.type != "VariableDeclaration") {
         exportInfo.path.replaceWith(exportInfo.declaration);
      }

      referenceExportToImport(
         importInfo,
         exportInfo,
         exportInfo.identifier.name
      );
   } else if (
      exportInfo.type == "aggregatedAll" ||
      exportInfo.type == "aggregatedName"
   ) {
      // There can't possibly an export with this type if `getExport` was used.
      // throw error for safety
      throw new Error("No handler for aggregated modules.");
   } else if (exportInfo.type == "aggregatedNamespace") {
      const aggregatedModule = getAggregatedModule(
         graph,
         script,
         importInfo,
         exportInfo
      );
      if (!aggregatedModule) return;
      const uid = getExportUid(exportInfo, importLocalName);
      const namespace = getOrCreateNamespace(
         context,
         aggregatedModule,
         exportInfo.path,
         uid
      );
      importScope.rename(importLocalName, namespace);
      referenceExportToImport(importInfo, exportInfo, namespace);
   }
}

function bindImport(
   context: TransformContext,
   graph: DependencyGraph,
   script: ScriptDependency,
   importInfo: ImportInfo
) {
   if (importInfo.type == "specifier" || importInfo.type == "default") {
      const importedName =
         importInfo.type == "specifier"
            ? getImportedName(importInfo.specifier)
            : "default";
      const aliasName = importInfo.specifier.local.name;
      const exportInfo = getExport(
         graph,
         importedName,
         importInfo.source,
         script.source
      );

      if (!exportInfo) {
         throw new Error(
            `No '${importedName}' export found in ${importInfo.source}`
         );
      }

      bindExported(
         context,
         graph,
         script,
         importInfo,
         exportInfo,
         importedName,
         aliasName
      );
   } else if (importInfo.type == "namespace") {
      const localName = importInfo.specifier.local.name;
      const request = importInfo.source;
      const resolvedRequest = script.dependencyMap[request];
      const resolvedModule = graph[resolvedRequest];
      if (resolvedModule.type != "script") return;
      const namespace = getOrCreateNamespace(
         context,
         resolvedModule,
         importInfo.path,
         localName
      );
      importInfo.path.scope.rename(localName, namespace);
      for (const exportName in resolvedModule.exports) {
         const exportInfo = resolvedModule.exports[exportName];
         bindExported(
            context,
            graph,
            script,
            importInfo,
            resolvedModule.exports[exportName],
            exportName,
            localName,
         );
         referenceExportToImport(importInfo, exportInfo, namespace);
      }
   }
}

/**
 * This method connects the imports of each module to the exported
 * declarations of other modules
 */
export function bindImports(context: TransformContext, graph: DependencyGraph) {
   const scriptModules = getSortedScripts(graph);
   exportDeclarationUIDMap.clear();
   namespaceExportsMap.clear();
   for (const script of scriptModules) {
      for (const importInfo of Object.values(script.imports)) {
         bindImport(context, graph, script, importInfo);
      }
   }

   // Remove left out imports/exports after binding
   for (const script of scriptModules) {
      const ast = script.ast;
      ast.program.body = ast.program.body.filter(
         (node) =>
            node.type !== "ExportDefaultDeclaration" &&
            node.type !== "ExportAllDeclaration" &&
            node.type !== "ExportNamedDeclaration" &&
            node.type !== "ImportDeclaration"
      );

      traverse(ast, {
         Program(path) {
            const bindings = path.scope.getAllBindings();
            Object.values(bindings).forEach(binding => {
               if (!binding.referencePaths.length) {
                  binding.path.remove();
                  console.log("treeshaken: ", getAst(binding.path.parent));
                  
               }
            });


            path.stop();
         }
      })
   }

   // for (const script of scriptModules) {
   //    const importInfo = Object.values(script.imports)[0];
   //    if (!importInfo) continue;
   //    console.log("-".repeat(60));
   //    console.log(script.source);
   //    Object.values(importInfo.path.scope.getAllBindings()).forEach(
   //       (binding) => {
   //          binding.referencePaths.forEach((ref) => {
   //             console.log(`${binding.identifier.name}: ${getAst(ref.parent)}`);
   //          });
   //       }
   //    );
   // }
}
