import { template } from "@babel/core";
import {
   identifier,
   variableDeclaration,
   variableDeclarator,
   isFunctionDeclaration,
   isClassDeclaration,
   StringLiteral,
   Identifier,
} from "@babel/types";
import { DependencyGraph, ScriptDependency } from "../../parse";
import { ImportInfo } from "../../parse/extract-imports";
import { ExportInfo } from "../../parse/extract-exports";
import { TransformContext } from "../utils/transform-context";
import { UidTracker } from "./UidTracker";
import { isLocal } from "../../utils";

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

   const name = UidTracker.getNamespaceFor(module.source);

   if (!name) {
      throw new Error(`No assigned namespace for ${module.source}.`);
   }

   namespaceMap.set(module.source, {
      namespace: name,
      build() {
         const exportedNames = Object.keys(module.exports.others);
         const exportObject =
            "{\n" +
            exportedNames
               .map((exportName) => {
                  const uid = getAssignedId(module.source, exportName);

                  // Add quotes if not a valid export name
                  const isValidName =
                     /^[a-z0-9$_]+$/i.test(exportName) &&
                     !/^[0-9]+/.test(exportName);
                  if (!isValidName) {
                     exportName = `"${exportName}"`;
                  }

                  let line = `${exportName}: () => ${uid}`;
                  return line;
               })
               .join(",\n") +
            "\n}";

         const builtTemplate = template.ast(`
            var ${name} = {};
            __export(${name}, ${exportObject});
         `);

         context.addRuntime("__export");
         context.unshiftAst(builtTemplate, module.source);
      },
   });

   return name;
}

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
   context: TransformContext,
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
      const parentModule = graph[parentSource] as ScriptDependency;
      createNamespaceExport(context, parentModule);
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
      const localName = importInfo.specifier.local.name;
      const namespacedModule = graph[importer.dependencyMap[importInfo.source]];
      if (namespacedModule?.type != "script") return;
      const namespace = createNamespaceExport(context, namespacedModule);
      importScope.rename(localName, namespace);
   }
}

/**
 * This method connects the imports of each module to the exported
 * declarations of other modules
 */
export function bindModules(
   context: TransformContext,
   graph: DependencyGraph,
   scriptModules: ScriptDependency[]
) {
   namespaceMap.clear();
   UidTracker.clear();
   UidTracker.assignWithModules(scriptModules);

   // Bind ids
   for (const module of scriptModules) {
      for (const importInfo of Object.values(module.imports.others)) {
         bindImport(context, graph, module, importInfo);
      }

      for (const exportInfo of Object.values(module.exports.others)) {
         bindExport(context, graph, exportInfo, module);
      }
   }

   // Build namespace templates
   for (const [_, namespace] of namespaceMap) {
      namespace.build();
   }

   // Remove left out imports/exports after binding
   for (const module of scriptModules) {
      /**
       * Remove from ast without using path.remove() because we still need to
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
