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
import { isLocal } from "../../utils";
import { getIdWithError, getNamespaceWithError } from "../utils/get-with-error";
import { renameBinding } from "../utils/renamer";
import type {
   ScriptModule,
   DependencyGraph,
   Toypack,
   ImportInfo,
   ExportInfo,
} from "src/types";
import { ModuleDescriptor } from "../utils/module-descriptor";
import { UidTracker } from "./UidTracker";

function getStringOrIdValue(node: StringLiteral | Identifier) {
   return node.type == "Identifier" ? node.name : node.value;
}

/**
 * Binds the imported module to the exported declarations.
 */
function bindExport(
   uidTracker: UidTracker,
   exporterModuleDescriptor: ModuleDescriptor,
   exportInfo: ExportInfo
) {
   const { module: exporter } = exporterModuleDescriptor;
   const exportScope = exportInfo.path.scope;
   const exportSource = exporter.source;
   const exportNode = exportInfo.path.node;

   if (exportInfo.type == "declared") {
      const decl = exportInfo.declaration;
      // Rename
      const newName = getIdWithError(uidTracker, exportSource, exportInfo.name);
      const binding = exportScope.getBinding(exportInfo.identifier.name)!;
      renameBinding(binding, newName, exporterModuleDescriptor);
   } else if (exportInfo.type == "declaredDefault") {
      const decl = exportInfo.declaration;

      // Rename
      const newName = getIdWithError(uidTracker, exportSource, "default");
      if (exportInfo.identifier) {
         const binding = exportScope.getBinding(exportInfo.identifier.name)!;
         renameBinding(binding, newName, exporterModuleDescriptor);
      } else {
         /**
          * Function/Class declarations are allowed to not have
          * ids when exported as default. So in here, we must make
          * sure that they get id'd
          */
         exporterModuleDescriptor.insertAt(
            exportNode.start!,
            `var ${newName} = `
         );
      }
   } else if (exportInfo.type == "declaredDefaultExpression") {
      // Create a variable declaration for the expression
      const newName = getIdWithError(uidTracker, exportSource, "default");
      exporterModuleDescriptor.insertAt(exportNode.start!, `var ${newName} = `);
   }
}

function bindImport(
   uidTracker: UidTracker,
   graph: DependencyGraph,
   importerModuleDescriptor: ModuleDescriptor,
   importInfo: ImportInfo
) {
   const { module: importer } = importerModuleDescriptor;
   const importScope = importInfo.path.scope;
   const importNode = importInfo.path.node;
   const importSource = importer.dependencyMap.get(importInfo.source);
   if (typeof importSource !== "string") return;
   // skip non-locals
   if (!isLocal(importInfo.source) && !importSource) return;
   if (!importSource) {
      throw new Error(
         `Failed to resolve '${importInfo.source}' in '${importer.source}'.`
      );
   }

   if (importInfo.type == "specifier" || importInfo.type == "default") {
      const importedName =
         importInfo.type == "specifier"
            ? getStringOrIdValue(importInfo.specifier.imported)
            : "default";
      const localName = importInfo.specifier.local.name;
      const binding = importScope.getBinding(localName)!;
      const newName = getIdWithError(uidTracker, importSource, importedName);
      renameBinding(binding, newName, importerModuleDescriptor);
   } else if (importInfo.type == "namespace") {
      const namespacedModule = graph.get(importSource);
      if (namespacedModule?.type != "script") return;
      const namespace = getNamespaceWithError(
         uidTracker,
         namespacedModule.source
      );
      const localName = importInfo.specifier.local.name;
      const binding = importScope.getBinding(localName)!;
      renameBinding(binding, namespace, importerModuleDescriptor);
   } else if (importInfo.type == "dynamic") {
      // Transform dynamic imports
      const namespacedModule = graph.get(importSource);
      if (namespacedModule?.type != "script") return;
      const namespace = getNamespaceWithError(
         uidTracker,
         namespacedModule.source
      );

      importerModuleDescriptor.update(
         importNode.start!,
         importNode.end!,
         `(async () => ${namespace})()`
      );
   }
}

/**
 * This method connects the imports of each module to the exported
 * declarations of other modules
 */
export function bindModules(
   uidTracker: UidTracker,
   graph: DependencyGraph,
   moduleDescriptor: ModuleDescriptor
) {
   const { module } = moduleDescriptor;
   // Bind ids
   const imports = module.getImports();
   for (const importInfo of imports) {
      bindImport(uidTracker, graph, moduleDescriptor, importInfo);
   }

   const exports = module.getExports();
   for (const exportInfo of exports) {
      bindExport(uidTracker, moduleDescriptor, exportInfo);
   }
}
