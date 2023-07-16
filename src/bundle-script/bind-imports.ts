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
   identifier,
   variableDeclaration,
   variableDeclarator,
} from "@babel/types";
import { NodePath, Scope } from "@babel/traverse";
import { template } from "@babel/core";

function getImportedName(specifier: ImportSpecifier) {
   const { imported } = specifier;
   return imported.type == "Identifier" ? imported.name : imported.value;
}

function getSpecifierValue(node: Identifier | StringLiteral) {
   return node.type == "Identifier" ? node.name : node.value;
}

function getImportersOfName(graph: DependencyGraph, importName: string) {
   const result: {
      module: ScriptDependency;
      importInfo: ImportInfo;
   }[] = [];
   for (const module of Object.values(graph)) {
      if (module.type != "script") continue;
      const imported = module.imports[importName];
      if (imported) {
         result.push({
            module,
            importInfo: imported,
         });
      }
   }

   return result;
}

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
 * 1. Check if the module has been exported aggregately by other modules.
 * 2. If it has, then check if it's a namespaced export.
 * 3. If it's a namespace export:
 *    - Remove that exportInfo from the module.
 *    - Get the module that imported that aggregated namespace and get
 *    the identifier used by it so we can change it later.
 *    - Create an object containing all the import of the current module.
 *    - Let the identifier of the created object and the importer be the same.
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
   importScope.registerDeclaration(exportScope.path);
   exportScope.registerDeclaration(importScope.path);
   if (!exportScope.hasBinding(importLocalName)) {
      exportScope.registerDeclaration(importInfo.path);
   }

   if (!importScope.hasBinding(importName)) {
      importScope.registerDeclaration(exportInfo.path);
   }

   if (exportInfo.type == "declared") {
      importScope.rename(importLocalName, exportInfo.identifier.name);
   } else if (exportInfo.type == "declaredDefault") {
      const uid = importScope.generateUid(importLocalName);
      importScope.rename(importLocalName, uid);
      if (exportInfo.declaration.type != "VariableDeclaration") {
         setExportDefaultIdentifier(exportInfo.declaration, uid);
      }
   } else if (exportInfo.type == "declaredDefaultExpression") {
      const uid = importScope.generateUid(importLocalName);
      importScope.rename(importLocalName, uid);
      const decl = variableDeclaration("const", [
         variableDeclarator(identifier(uid), exportInfo.declaration),
      ]);
      exportInfo.path.replaceWith(decl);
   } else if (
      exportInfo.type == "aggregatedAll" ||
      exportInfo.type == "aggregatedName"
   ) {
      // There can't possibly an export with this type if `getExport` was used.
      // throw error for safety
      throw new Error("No handler for aggregated modules.");
   } else if (exportInfo.type == "aggregatedNamespace") {
      /**
       * This will be handled below
       */
      // const resolvedImportSource = script.dependencyMap[importInfo.source];
      // console.log(resolvedImportSource);
      // const importedModule = graph[resolvedImportSource];
      // const uid = importScope.generateUid(importLocalName);
      // const decl = variableDeclaration("const", [
      //    variableDeclarator(identifier(uid), exportInfo.declaration),
      // ]);
      // console.log(importedModule, exportInfo.source);
      // const mod = graph;
      // exportInfo.path.replaceWith(decl);
   }
}

function bindImport(
   graph: DependencyGraph,
   script: ScriptDependency,
   importInfo: ImportInfo
) {
   if (importInfo.type == "sideEffect") {
      importInfo.path.remove();
   } else if (importInfo.type == "specifier") {
      const importedName = getImportedName(importInfo.specifier);
      const aliasName = importInfo.specifier.local.name;
      const exportInfo = getExport(
         graph,
         importedName,
         importInfo.source,
         script.source
      );
      if (!exportInfo) return;
      bindExported(
         graph,
         script,
         importInfo,
         exportInfo,
         importedName,
         aliasName
      );
   } else if (importInfo.type == "default") {
      const importedName = "default";
      const aliasName = importInfo.specifier.local.name;
      const exportInfo = getExport(
         graph,
         importedName,
         importInfo.source,
         script.source
      );
      if (!exportInfo) return;
      bindExported(
         graph,
         script,
         importInfo,
         exportInfo,
         importedName,
         aliasName
      );
   } else if (importInfo.type == "namespace") {
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
   exportsMap: Record<string, string>,
) {
   const code = `
var %%id%% = {};
%%exportId%%(%%id%%, %%exports%%);
`;
   
   const result = template(code)({
      id: namespace,
      exportId,
      exports: `{\n${Object.entries(exportsMap)
         .map(([key, value], i) => {
            let line = `   ${key}: () => ${value}`;
            return line;
         })
         .join(",\n")}\n}`,
   });

   return Array.isArray(result) ? result : [result];
}

function bindAggr(graph: DependencyGraph, script: ScriptDependency) {
   const aggs = getAggregateNamespaceExports(graph, script.source);
   for (const agg of aggs) {
      const namespace = agg.exportInfo.specifier.exported.name;
      const importers = getImportersOfName(graph, namespace);
      for (const { importInfo } of importers) {
         if (importInfo.type == "sideEffect") continue;
      }
      // const x = createExports("_export", "ADDsERR", [
      //    "hey",
      //    "dog",
      //    "car",
      // ]);
      // console.log(x);

      // agg.exportInfo.path.replaceWithMultiple(x);
   }
   if (aggs.length) {
      const x = createNamespaceExport("_export", "ADDsERR", {
         test: "test",
         default: "hey",
         fesa: "ge",
      });
      script.ast.program.body.push(...x);
   }
}

export function bindImports(graph: DependencyGraph) {
   const scriptModules = Object.values(graph).filter(
      (g): g is ScriptDependency => g.type == "script"
   );

   for (const script of scriptModules) {
      for (const importInfo of Object.values(script.imports)) {
         bindImport(graph, script, importInfo);
      }
      bindAggr(graph, script);
   }
}
