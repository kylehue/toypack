import {
   identifier,
   variableDeclaration,
   variableDeclarator,
   isFunctionDeclaration,
   isClassDeclaration,
   StringLiteral,
   Identifier,
   arrowFunctionExpression,
   callExpression,
} from "@babel/types";
import { DependencyGraph, ScriptDependency } from "../../parse";
import { ImportInfo } from "../../parse/extract-imports";
import { ExportInfo } from "../../parse/extract-exports";
import { UidTracker } from "./UidTracker";
import { isLocal } from "../../utils";
import Toypack from "src/Toypack";

function getAssignedId(source: string, name: string) {
   const uid = UidTracker.get(source, name);

   if (!uid) {
      throw new Error(
         `Failed to get the assigned id for "${name}" in ${source}.`
      );
   }

   return uid;
}

/**
 * Binds the imported module to the exported declarations.
 */
function bindExport(
   this: Toypack,
   graph: DependencyGraph,
   exportInfo: ExportInfo,
   exportInfosModule: ScriptDependency
) {
   const exportScope = exportInfo.path.scope;
   const exportSource = exportInfosModule.source;

   if (exportInfo.type == "declared") {
      const id = getAssignedId(exportSource, exportInfo.name);
      exportScope.rename(exportInfo.identifier.name, id);

      /**
       * For some weird reason, the `identifier.name` sometimes doesn't
       * change to `id` on the next run, which causes the renaming to fail
       * and cause errors. One way to solve this is to assign the `id`
       * to `identifier.name` manually.
       */
      exportInfo.identifier.name = id;
   } else if (exportInfo.type == "declaredDefault") {
      const declPath = exportInfo.declaration;
      if (declPath.isFunctionDeclaration() || declPath.isClassDeclaration()) {
         /**
          * Function/Class declarations are allowed to not have
          * ids when exported as default. So in here, we must make
          * sure that they get id'd
          */
         if (!declPath.node.id) {
            declPath.node.id = identifier(
               getAssignedId(exportSource, "default")
            );
            exportScope.registerDeclaration(declPath);
         }
         // Remove from its `export` declaration
         const exportDecl = exportInfo.path.node.declaration;
         if (
            isFunctionDeclaration(exportDecl) ||
            isClassDeclaration(exportDecl)
         ) {
            exportInfo.path.replaceWith(declPath.node);
            exportInfo.identifier = declPath.node.id;
         }
      }

      const id = getAssignedId(exportSource, exportInfo.name);
      if (exportInfo.identifier) {
         exportScope.rename(exportInfo.identifier.name, id);
         exportInfo.identifier.name = id;
      }
   } else if (exportInfo.type == "declaredDefaultExpression") {
      // Create a variable declaration for the expression
      const id = identifier(getAssignedId(exportSource, "default"));
      const varDecl = variableDeclaration("var", [
         variableDeclarator(id, exportInfo.declaration.node),
      ]);
      exportInfo.path.replaceWith(varDecl);
   } else if (exportInfo.type == "aggregatedNamespace") {
      const parentSource = exportInfosModule.dependencyMap[exportInfo.source];
      const namespacedModule = graph[parentSource] as ScriptDependency;
      this._setCache("compiled", namespacedModule.source, {
         needsNamespace: true,
      });
   }
}

function getStringOrIdValue(node: StringLiteral | Identifier) {
   return node.type == "Identifier" ? node.name : node.value;
}

function bindImport(
   this: Toypack,
   graph: DependencyGraph,
   importer: ScriptDependency,
   importInfo: ImportInfo
) {
   if (!isLocal(importInfo.source)) return;

   const importScope = importInfo.path.scope;
   const importSource = importer.dependencyMap[importInfo.source];
   const importedModule = graph[importSource];
   if (importedModule?.type != "script") return;

   if (importInfo.type == "specifier" || importInfo.type == "default") {
      const importedName =
         importInfo.type == "specifier"
            ? getStringOrIdValue(importInfo.specifier.imported)
            : "default";
      const localName = importInfo.specifier.local.name;
      importScope.rename(localName, getAssignedId(importSource, importedName));
   } else if (importInfo.type == "namespace") {
      const namespacedModule = graph[importer.dependencyMap[importInfo.source]];
      if (namespacedModule?.type != "script") return;
      this._setCache("compiled", namespacedModule.source, {
         needsNamespace: true,
      });
      const namespace = UidTracker.getNamespaceFor(namespacedModule.source);
      const localName = importInfo.specifier.local.name;
      importScope.rename(localName, namespace);
   } else if (importInfo.type == "dynamic") {
      const namespacedModule = graph[importer.dependencyMap[importInfo.source]];
      if (namespacedModule?.type != "script") return;
      this._setCache("compiled", namespacedModule.source, {
         needsNamespace: true
      });
      const namespace = UidTracker.getNamespaceFor(namespacedModule.source);

      // transform dynamic imports
      importInfo.path.replaceWith(
         callExpression(
            arrowFunctionExpression([], identifier(namespace), true),
            []
         )
      );
   }
}

/**
 * This method connects the imports of each module to the exported
 * declarations of other modules
 */
export function bindModules(
   this: Toypack,
   graph: DependencyGraph,
   module: ScriptDependency,
) {
   // Bind ids
   for (const importInfo of [
      ...Object.values(module.imports.others),
      ...module.imports.dynamic,
   ]) {
      bindImport.call(this, graph, module, importInfo);
   }

   for (const exportInfo of Object.values(module.exports.others)) {
      bindExport.call(this, graph, exportInfo, module);
   }

   /**
    * Remove left out imports/exports after binding - and we shouldn't use
    * path.remove() because we still need to use them on the next runs.
    */
   const ast = module.ast;
   ast.program.body = ast.program.body.filter(
      (node) =>
         node.type !== "ExportDefaultDeclaration" &&
         node.type !== "ExportAllDeclaration" &&
         node.type !== "ExportNamedDeclaration" &&
         node.type !== "ImportDeclaration"
   );
}
