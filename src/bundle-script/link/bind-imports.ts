import { template } from "@babel/core";
import {
   identifier,
   variableDeclaration,
   variableDeclarator,
   isFunctionDeclaration,
   isClassDeclaration,
   importNamespaceSpecifier,
   StringLiteral,
   Identifier,
} from "@babel/types";
import { DependencyGraph, ScriptDependency } from "../../parse";
import { ImportInfo } from "../../parse/extract-imports";
import { ExportInfo } from "../../parse/extract-exports";
import { getExport } from "../utils/get-export";
import { TransformContext } from "../utils/transform-context";
import { ExportUidTracker } from "./ExportUidTracker";
import { isLocal } from "../../utils";

function removeImportsAndExports(scriptModules: ScriptDependency[]) {
   for (const module of scriptModules) {
      /**
       * Before removing, we must assure that the exports that has the
       * declarations in its path get seperated. e.g.
       *
       * In:
       * export function fn() {}
       *
       * Out:
       * function fn() {}
       */
      for (const exportInfo of Object.values(module.exports.others)) {
         if (exportInfo.path.removed) {
            continue;
         }

         if (
            exportInfo.type == "declared" ||
            exportInfo.type == "declaredDefault" ||
            exportInfo.type == "declaredDefaultExpression"
         ) {
            const declPath = exportInfo.declaration;

            if (
               declPath.isFunctionDeclaration() ||
               declPath.isClassDeclaration()
            ) {
               const exportDecl = exportInfo.path.node.declaration;
               if (
                  isFunctionDeclaration(exportDecl) ||
                  isClassDeclaration(exportDecl)
               ) {
                  exportInfo.path.replaceWith(declPath.node);
               }
            }
         }
      }

      /**
       * Remove from ast without using .remove() because we still need to
       * use them on the next runs.
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
}

const namespaceMap = new Map<
   string,
   {
      namespace: string;
      build: () => void;
   }
>();

function createNamespaceExport(
   context: TransformContext,
   module: ScriptDependency
) {
   const declared = namespaceMap.get(module.source);
   if (declared) {
      return declared.namespace;
   }

   const name = ExportUidTracker.getNamespaceFor(module.source);

   if (!name) {
      throw new Error(`No assigned namespace for ${module.source}.`);
   }

   namespaceMap.set(module.source, {
      namespace: name,
      build() {
         const exportEntries = Object.entries(module.exports.others);
         const formattedExports = exportEntries
            .map(([exportName, exportInfo]) => {
               const uid = getAssignedId(module.source, exportName);
               let line = `${exportName}: () => ${uid}`;
               return line;
            })
            .join(",\n");

         const buildTemplate = template(`
            var ${name} = {};
            __export(${name}, {\n${formattedExports}\n});
         `);

         const builtTemplate = buildTemplate();
         context.addRuntime("__export");
         context.unshiftAst(builtTemplate, module.source);
      },
   });

   return name;
}

function getAssignedId(source: string, name: string) {
   const uid = ExportUidTracker.get(source, name);

   if (!uid) {
      throw new Error(`Failed to get the assigned id for ${name} in ${source}`);
   }

   return uid;
}

/**
 * Binds the imported module to the exported declarations.
 */
function bindExported(
   context: TransformContext,
   graph: DependencyGraph,
   importer: ScriptDependency,
   importInfo: ImportInfo,
   exportInfo: ExportInfo,
   importLocalName: string
) {
   const importScope = importInfo.path.scope;
   const exportScope = exportInfo.path.scope;
   const exportSource = importer.dependencyMap[importInfo.source];
   if (importInfo.path.removed) return;
   if (exportInfo.path.removed) return;

   if (exportInfo.type == "declared") {
      const id = getAssignedId(exportSource, exportInfo.name);
      importScope.rename(importLocalName, id);
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
      importScope.rename(importLocalName, id);
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
      importScope.rename(importLocalName, id.name);
   } else if (exportInfo.type == "aggregatedNamespace") {
      const parentSource = importer.dependencyMap[importInfo.source];
      const parentModule = graph[parentSource] as ScriptDependency;
      /**
       * This export type is basically just an import anyway, so
       * we can let the `bindImport` function handle the namespacing.
       */
      const facadeImportInfo: ImportInfo = {
         id: importInfo.id,
         type: "namespace",
         path: importInfo.path,
         source: exportInfo.source,
         specifier: importNamespaceSpecifier(exportInfo.specifier.exported),
      };
      bindImport(context, graph, parentModule, facadeImportInfo);

      const aggrSource = parentModule.dependencyMap[exportInfo.source];
      const id = ExportUidTracker.getNamespaceFor(aggrSource);
      importScope.rename(importLocalName, id);
   }
}

function getStringOrIdValue(node: StringLiteral | Identifier) {
   return node.type == "Identifier" ? node.name : node.value;
}

function bindImport(
   context: TransformContext,
   graph: DependencyGraph,
   importer: ScriptDependency,
   importInfo: ImportInfo
) {
   if (!isLocal(importInfo.source)) return;
   if (importInfo.type == "specifier" || importInfo.type == "default") {
      const importedName =
         importInfo.type == "specifier"
            ? getStringOrIdValue(importInfo.specifier.imported)
            : "default";
      const localName = importInfo.specifier.local.name;
      const exportInfo = getExport(
         graph,
         importedName,
         importInfo.source,
         importer.source
      );

      if (!exportInfo) {
         throw new Error(
            `No '${importedName}' export found in ${importInfo.source}`
         );
      }

      bindExported(context, graph, importer, importInfo, exportInfo, localName);
   } else if (importInfo.type == "namespace") {
      const localName = importInfo.specifier.local.name;
      const namespacedModule = graph[importer.dependencyMap[importInfo.source]];
      if (namespacedModule?.type != "script") return;
      const declared = namespaceMap.get(namespacedModule.source);
      let namespace;
      if (!declared) {
         namespace = createNamespaceExport(context, namespacedModule);
         Object.entries(namespacedModule.exports.others).forEach(
            ([name, exportInfo]) => {
               bindExported(
                  context,
                  graph,
                  importer,
                  importInfo,
                  exportInfo,
                  name
               );
            }
         );
      } else {
         namespace = declared.namespace;
      }

      importInfo.path.scope.rename(localName, namespace);
   }
}

/**
 * This method connects the imports of each module to the exported
 * declarations of other modules
 */
export function bindImports(
   context: TransformContext,
   graph: DependencyGraph,
   scriptModules: ScriptDependency[]
) {
   namespaceMap.clear();
   ExportUidTracker.clear();
   ExportUidTracker.assignWithModules(scriptModules);

   // Bind
   for (const module of scriptModules) {
      for (const importInfo of Object.values(module.imports.others)) {
         bindImport(context, graph, module, importInfo);
      }
   }

   // Build namespace templates
   for (const [_, namespace] of namespaceMap) {
      namespace.build();
   }

   // Remove left out imports/exports after binding
   removeImportsAndExports(scriptModules);
}
