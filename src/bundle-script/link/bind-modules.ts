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
import {
   getIdWithError,
   getNamespaceWithError,
   resolveWithError,
} from "../utils/get-with-error";
import type {
   ScriptModule,
   DependencyGraph,
   Toypack,
   ImportInfo,
   ExportInfo,
} from "src/types";

function getStringOrIdValue(node: StringLiteral | Identifier) {
   return node.type == "Identifier" ? node.name : node.value;
}

/**
 * Binds the imported module to the exported declarations.
 */
function bindExport(
   this: Toypack,
   graph: DependencyGraph,
   exportInfo: ExportInfo,
   exportInfosModule: ScriptModule
) {
   const exportScope = exportInfo.path.scope;
   const exportSource = exportInfosModule.source;

   if (exportInfo.type == "declared") {
      const id = getIdWithError.call(this, exportSource, exportInfo.name);
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
               getIdWithError.call(this, exportSource, "default")
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

      const id = getIdWithError.call(this, exportSource, exportInfo.name);
      if (exportInfo.identifier) {
         exportScope.rename(exportInfo.identifier.name, id);
         exportInfo.identifier.name = id;
      }
   } else if (exportInfo.type == "declaredDefaultExpression") {
      // Create a variable declaration for the expression
      const id = identifier(getIdWithError.call(this, exportSource, "default"));
      const varDecl = variableDeclaration("var", [
         variableDeclarator(id, exportInfo.declaration.node),
      ]);
      exportInfo.path.replaceWith(varDecl);
   } else if (exportInfo.type == "aggregatedNamespace") {
      const parentSource = resolveWithError(
         exportInfosModule,
         exportInfo.source
      );
      // this should be guaranteed
      const namespacedModule = graph.get(parentSource) as ScriptModule;
      this._setCache("compiled", namespacedModule.source, {
         needsNamespace: true,
      });
   }
}

function bindImport(
   this: Toypack,
   graph: DependencyGraph,
   importer: ScriptModule,
   importInfo: ImportInfo
) {
   const importSource = importer.dependencyMap.get(importInfo.source);
   if (typeof importSource !== "string") return;
   // skip non-locals
   if (!isLocal(importInfo.source)) return;

   const importedModule = graph.get(importSource);
   if (importedModule?.type != "script") {
      throw new Error(
         `Failed to resolve '${importInfo.source}' in '${importer.source}'.`
      );
   }

   const importScope = importInfo.path.scope;
   if (importInfo.type == "specifier" || importInfo.type == "default") {
      const importedName =
         importInfo.type == "specifier"
            ? getStringOrIdValue(importInfo.specifier.imported)
            : "default";
      const localName = importInfo.specifier.local.name;
      importScope.rename(
         localName,
         getIdWithError.call(this, importSource, importedName)
      );
   } else if (importInfo.type == "namespace") {
      const namespacedModule = graph.get(importSource);
      if (namespacedModule?.type != "script") return;
      this._setCache("compiled", namespacedModule.source, {
         needsNamespace: true,
      });
      const namespace = getNamespaceWithError.call(
         this,
         namespacedModule.source
      );

      const localName = importInfo.specifier.local.name;
      importScope.rename(localName, namespace);
   } else if (importInfo.type == "dynamic") {
      const namespacedModule = graph.get(importSource);
      if (namespacedModule?.type != "script") return;
      this._setCache("compiled", namespacedModule.source, {
         needsNamespace: true,
      });
      const namespace = getNamespaceWithError.call(
         this,
         namespacedModule.source
      );

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
   module: ScriptModule
) {
   // Bind ids
   const imports = module.getImports([
      "default",
      "dynamic",
      "namespace",
      "specifier",
   ]);

   for (const importInfo of imports) {
      bindImport.call(this, graph, module, importInfo);
   }

   const exports = module.getExports([
      "declared",
      "declaredDefault",
      "declaredDefaultExpression",
      "aggregatedNamespace",
   ]);

   for (const exportInfo of exports) {
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
