import { DependencyGraph, ScriptDependency } from "src/graph";
import { ImportInfo } from "src/graph/extract-imports";
import {
   AggregatedNamespaceExport,
   ExportInfo,
} from "src/graph/extract-exports";
import { getExport } from "./get-export";
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
} from "@babel/types";
import { NodePath, Scope } from "@babel/traverse";
import { template } from "@babel/core";
import { getSortedScripts } from "./get-sorted-scripts";
import path from "path-browserify";

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
   const previouslyUsedName = exportDeclarationUIDMap.get(exportInfo.id);
   let uid;
   if (previouslyUsedName) {
      uid = previouslyUsedName;
   } else {
      uid = exportInfo.path.scope.generateUid(name);
      exportDeclarationUIDMap.set(exportInfo.id, uid);
   }

   return uid;
}

const assignedIds = new Map<string, string>();
function getAssignedId(scope: Scope, name: string) {
   const assigned = assignedIds.get(name);
   let uid;
   if (assigned) {
      uid = assigned;
   } else {
      uid = scope.generateUid(name);
      assignedIds.set(name, uid);
   }

   return uid;
}

/**
 * Binds the imported module references to the exported declaration.
 */
function bindExported(
   graph: DependencyGraph,
   script: ScriptDependency,
   importInfo: ImportInfo,
   exportInfo: ExportInfo,
   importName: string,
   importLocalName: string
) {
   const exportScope = exportInfo.path.scope;
   const importScope = importInfo.path.scope;
   const isAlreadyDeclared = !!exportDeclarationUIDMap.get(exportInfo.id);

   const suggestedId =
      importName == "default"
         ? `${path.basename(importInfo.source)}_default`
         : importLocalName;

   if (exportInfo.type == "declared") {
      const uid = getExportUid(exportInfo, exportInfo.identifier.name);
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
   } else if (exportInfo.type == "declaredDefault") {
      const uid = getExportUid(exportInfo, suggestedId);
      importScope.rename(importLocalName, uid);

      if (exportInfo.identifier) {
         exportScope.rename(exportInfo.identifier.name, uid);
      } else if (exportInfo.declaration.type != "VariableDeclaration") {
         /**
          * Declared default functions are allowed to not have
          * identifiers, so here, we're gonna id them
          */
         setExportDefaultIdentifier(exportInfo.declaration, uid);
         /**
          * Since it didn't have a name before, then it isn't in its
          * scope's bindings. With that being said, we have to manually
          * register it in its scope's bindings.
          */
         const bindingKind =
            exportInfo.declaration.type == "ClassDeclaration"
               ? "let"
               : "hoisted";
         exportScope.registerBinding(bindingKind, exportInfo.path);
      }

      if (
         !isAlreadyDeclared &&
         exportInfo.declaration.type != "VariableDeclaration"
      ) {
         exportInfo.path.replaceWith(exportInfo.declaration);
      }

      referenceExportToImport(importInfo, exportInfo, uid);
   } else if (exportInfo.type == "declaredDefaultExpression") {
      const uid = getExportUid(exportInfo, suggestedId);
      importScope.rename(importLocalName, uid);

      if (!isAlreadyDeclared) {
         const decl = variableDeclaration("const", [
            variableDeclarator(identifier(uid), exportInfo.declaration),
         ]);
         exportInfo.path.replaceWith(decl);
      }

      referenceExportToImport(importInfo, exportInfo, uid);
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
      const uid = getExportUid(exportInfo, suggestedId);
      importScope.rename(importLocalName, uid);

      if (!isAlreadyDeclared) {
         const exports = create(aggregatedModule, uid);
         aggregatedModule.ast.program.body.push(...exports);
      }
   }
}

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

function create(module: ScriptDependency, id: string) {
   const exportEntries = Object.entries(module.exports);
   const formattedExports = exportEntries
      .map(([exportId, value], index) => {
         const computedExportId =
            (value.type == "declared" || value.type == "declaredDefault") &&
            value.identifier
               ? value.identifier.name
               : exportDeclarationUIDMap.get(value.id);
         if (!computedExportId) {
            throw new Error(
               `Can't find '${exportId}' export in ${module.source}.`
            );
         }
         let line = `${exportId}: ${computedExportId}`;
         if (index == 0) line = "{\n" + line;
         if (index == exportEntries.length - 1) line += "\n}";
         return line;
      })
      .join(",\n");

   const buildTemplate = template(`
      const ID = ${formattedExports}
   `);

   const result = buildTemplate({
      ID: id,
   });

   return Array.isArray(result) ? result : [result];
}

function bindImport(
   graph: DependencyGraph,
   script: ScriptDependency,
   importInfo: ImportInfo,
   namespace = "test"
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
         graph,
         script,
         importInfo,
         exportInfo,
         importedName,
         aliasName
      );
   }
}

function createExportHelper(scope: Scope) {
   const code = `
const %%exportId%% = (target, all) => {
   for (const name in all)
   Object.defineProperty(target, name, { get: all[name], enumerable: true });
};
`;

   return template(code)({
      exportId: scope.generateUid("_export"),
   });
}

function createNamespaceExport(
   exportId: string,
   namespace: string,
   exportsMap: Record<string, string>
) {
   const formattedExportsMap = `{${Object.entries(exportsMap)
      .map(([key, value], i) => {
         let line = `${key}: () => ${value}`;
         return line;
      })
      .join(",")}}`;

   const code = `
var ID = {};
EXPORT_ID(ID, ${formattedExportsMap});
`;

   const result = template.smart(code)({
      ID: namespace,
      EXPORT_ID: exportId,
   });

   return Array.isArray(result) ? result : [result];
}

/**
 * 1. Check if the module has been exported aggregately by other modules.
 * 2. If it has, then check if it's a namespaced export.
 * 3. If it's a namespace export:
 *    - Remove that exportInfo from the module.
 *    - Get the module that imported that aggregated namespace and get
 *    the identifier used by it so we can change it later.
 *    - Create an object containing all the import of the current module.
 *    - Let the identifier of the created object and the importer be the same.
 */
function bindAggr(graph: DependencyGraph, script: ScriptDependency) {
   const aggs = getAggregateNamespaceExports(graph, script.source);
   // TODO: clean this (every thing here is temporary)
   let name = "";
   for (const agg of aggs) {
      const namespace = agg.exportInfo.specifier.exported.name;
      const importers = getImportersOfName(graph, script.source, namespace);
      console.log(importers);

      for (const { importInfo } of importers) {
         if (importInfo.type == "sideEffect") continue;
         name ||= agg.exportInfo.path.scope.generateUid(
            importInfo.specifier.local.name
         );
         importInfo.path.scope.rename(importInfo.specifier.local.name, name);
      }
      // const x = createExports("_export", "ADDsERR", [
      //    "hey",
      //    "dog",
      //    "car",
      // ]);
      // console.log(x);

      // agg.exportInfo.path.replaceWithMultiple(x);
   }
   // if (aggs.length) {
   //    const x = createNamespaceExport("_export", name, {
   //       test: "test",
   //       default: "hey",
   //       fesa: "ge",
   //    });
   //    script.ast.program.body.push(...x);
   // }
}

/**
 * This method connects the imports of each module to the exported
 * declarations of other modules
 */
export function bindImports(graph: DependencyGraph) {
   const scriptModules = getSortedScripts(graph);
   exportDeclarationUIDMap.clear();
   for (const script of scriptModules) {
      for (const importInfo of Object.values(script.imports)) {
         bindImport(graph, script, importInfo);
         importInfo.path.replaceWithMultiple;
      }
      //bindAggr(graph, script);
   }
}
