import { StringLiteral, Identifier } from "@babel/types";
import { isLocal } from "../../utils";
import { getIdWithError, getNamespaceWithError } from "../utils/get-with-error";
import { renameBinding } from "../utils/renamer";
import { UidTracker } from "./UidTracker";
import { ModuleTransformer } from "../../utils/module-transformer";
import type {
   DependencyGraph,
   ImportInfo,
   ExportInfo,
   Toypack,
   ScriptModule,
} from "src/types";

function getStringOrIdValue(node: StringLiteral | Identifier) {
   return node.type == "Identifier" ? node.name : node.value;
}

/**
 * Binds the imported module to the exported declarations.
 */
function bindExport(
   this: Toypack,
   uidTracker: UidTracker,
   exporterModuleTransformer: ModuleTransformer,
   exportInfo: ExportInfo
) {
   const { module: exporter } = exporterModuleTransformer;
   const exportScope = exportInfo.path.scope;
   const exportSource = exporter.source;
   const exportNode = exportInfo.path.node;

   if (exportInfo.type == "declared") {
      // Rename
      const newName = getIdWithError.call(
         this,
         uidTracker,
         exportSource,
         exportInfo.name
      );
      const binding = exportScope.getBinding(exportInfo.identifier.name)!;
      renameBinding(binding, newName, exporterModuleTransformer);
   } else if (exportInfo.type == "declaredDefault") {
      // Rename
      const newName = getIdWithError.call(
         this,
         uidTracker,
         exportSource,
         "default"
      );
      if (exportInfo.identifier) {
         const binding = exportScope.getBinding(exportInfo.identifier.name)!;
         renameBinding(binding, newName, exporterModuleTransformer);
      } else {
         /**
          * Function/Class declarations are allowed to not have
          * ids when exported as default. So in here, we must make
          * sure that they get id'd
          */
         exporterModuleTransformer.insertAt(
            exportNode.start!,
            `var ${newName} = `
         );
      }
   } else if (exportInfo.type == "declaredDefaultExpression") {
      // Create a variable declaration for the expression
      const newName = getIdWithError.call(
         this,
         uidTracker,
         exportSource,
         "default"
      );
      exporterModuleTransformer.insertAt(
         exportNode.start!,
         `var ${newName} = `
      );
   }
}

function bindImport(
   this: Toypack,
   uidTracker: UidTracker,
   graph: DependencyGraph,
   importerModuleTransformer: ModuleTransformer,
   importInfo: ImportInfo
) {
   const { module: importer } = importerModuleTransformer;
   const importScope = importInfo.path.scope;
   const importNode = importInfo.path.node;
   const importSource = importer.dependencyMap.get(importInfo.source);
   if (typeof importSource !== "string") return;

   // skip non-locals
   if (!isLocal(importInfo.source) && !importSource) return;
   if (!importSource) return;

   if (importInfo.type == "specifier" || importInfo.type == "default") {
      const importedName =
         importInfo.type == "specifier"
            ? getStringOrIdValue(importInfo.specifier.imported)
            : "default";
      const localName = importInfo.specifier.local.name;
      const binding = importScope.getBinding(localName)!;
      const newName = getIdWithError.call(
         this,
         uidTracker,
         importSource,
         importedName
      );
      renameBinding(binding, newName, importerModuleTransformer);
   } else if (importInfo.type == "namespace") {
      const namespacedModule = graph.get(importSource);
      if (namespacedModule?.type != "script") return;
      const namespace = getNamespaceWithError.call(
         this,
         uidTracker,
         namespacedModule.source
      );
      const localName = importInfo.specifier.local.name;
      const binding = importScope.getBinding(localName)!;
      renameBinding(binding, namespace, importerModuleTransformer);
   } else if (importInfo.type == "dynamic") {
      // Transform dynamic imports
      const namespacedModule = graph.get(importSource);
      if (namespacedModule?.type != "script") return;
      const namespace = getNamespaceWithError.call(
         this,
         uidTracker,
         namespacedModule.source
      );

      importerModuleTransformer.update(
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
   this: Toypack,
   uidTracker: UidTracker,
   graph: DependencyGraph,
   moduleTransformer: ModuleTransformer<ScriptModule>
) {
   const { module } = moduleTransformer;
   // Bind ids
   const imports = module.getImports();
   for (const importInfo of imports) {
      bindImport.call(this, uidTracker, graph, moduleTransformer, importInfo);
   }

   const exports = module.getExports();
   for (const exportInfo of exports) {
      bindExport.call(this, uidTracker, moduleTransformer, exportInfo);
   }
}
