import { template } from "@babel/core";
import {
   identifier,
   variableDeclaration,
   variableDeclarator,
   isFunctionDeclaration,
   isClassDeclaration,
   importNamespaceSpecifier,
} from "@babel/types";
import { DependencyGraph, ScriptDependency } from "../../parse";
import { ImportInfo } from "../../parse/extract-imports";
import { ExportInfo } from "../../parse/extract-exports";
import { getExport } from "../utils/get-export";
import { TransformContext } from "../utils/transform-context";
import { ExportUidTracker } from "./ExportUidTracker";

const namespaceMap = new Map<
   string,
   {
      namespace: string;
      build: () => void;
   }
>();

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
function createNamespaceExport(
   context: TransformContext,
   module: ScriptDependency
) {
   const declared = namespaceMap.get(module.source);
   if (declared) {
      return declared.namespace;
   }

   const name = exportUidTracker.getNamespaceFor(module.source);

   if (!name) {
      throw new Error(`No assigned namespace for ${module.source}.`);
   }

   namespaceMap.set(module.source, {
      namespace: name,
      build() {
         const exportEntries = Object.entries(module.exports.others);
         const formattedExports = exportEntries
            .map(([exportName, exportInfo]) => {
               if (
                  exportInfo.type !== "declared" &&
                  exportInfo.type !== "declaredDefault" &&
                  exportInfo.type !== "declaredDefaultExpression" &&
                  exportInfo.type !== "aggregatedNamespace"
               ) {
                  throw new Error("Namespaced exports has to be declared.");
               }

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

const exportUidTracker = new ExportUidTracker();
function getAssignedId(source: string, name: string) {
   const uid = exportUidTracker.get(source, name);

   if (!uid) {
      throw new Error(`Failed to get the assigned id for ${name} in ${source}`);
   }

   return uid;
}

function matchImportAndExportName(
   importInfo: ImportInfo,
   importName: string,
   exportInfo: ExportInfo,
   exportName: string,
   exportSource: string
) {
   const exportScope = exportInfo.path.scope;
   const importScope = importInfo.path.scope;
   const uid = getAssignedId(exportSource, exportName);
   importScope.rename(importName, uid);
   exportScope.rename(exportName, uid);
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
   const exportScope = exportInfo.path.scope;
   const importScope = importInfo.path.scope;
   const exportSource = importer.dependencyMap[importInfo.source];

   if (exportInfo.type == "declared") {
      matchImportAndExportName(
         importInfo,
         importLocalName,
         exportInfo,
         exportInfo.name,
         exportSource
      );

      importScope.getBinding(exportInfo.identifier.name)?.path.remove();
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
         const id = declPath.node.id;
         // Remove the `export` declaration
         const exportDecl = exportInfo.path.node.declaration;
         if (
            isFunctionDeclaration(exportDecl) ||
            isClassDeclaration(exportDecl)
         ) {
            exportInfo.path.replaceWith(declPath);
         } else {
            exportInfo.path.remove();
         }
         matchImportAndExportName(
            importInfo,
            importLocalName,
            exportInfo,
            exportInfo.name,
            exportSource
         );
         importScope.getBinding(id.name)?.path.remove();
      } else {
         // id should be guaranteed when vars are exported as default
         const id = exportInfo.identifier!;
         matchImportAndExportName(
            importInfo,
            importLocalName,
            exportInfo,
            exportInfo.name,
            exportSource
         );
         importScope.getBinding(id.name)?.path.remove();

         if (!exportInfo.path.removed) {
            exportInfo.path.remove();
         }
      }
   } else if (exportInfo.type == "declaredDefaultExpression") {
      /**
       * Create a variable declaration for the expression and
       * replace the `export` declaration with it e.g.
       */
      const id = identifier(getAssignedId(exportSource, "default"));
      const varDecl = variableDeclaration("var", [
         variableDeclarator(id, exportInfo.declaration.node),
      ]);
      const [varDeclPath] = exportInfo.path.replaceWith(varDecl);
      exportScope.registerDeclaration(varDeclPath);
      matchImportAndExportName(
         importInfo,
         importLocalName,
         exportInfo,
         exportInfo.name,
         exportSource
      );
      importScope.getBinding(id.name)?.path.remove();
   } else if (exportInfo.type == "aggregatedNamespace") {
      /**
       * This export type is basically just an import anyway, so
       * we can let the `bindImport` function handle the namespacing.
       */
      const parentSource = importer.dependencyMap[importInfo.source];
      const parentModule = graph[parentSource] as ScriptDependency;
      const id = exportInfo.specifier.exported;
      const facadeImportInfo: ImportInfo = {
         id: importInfo.id,
         type: "namespace",
         path: importInfo.path,
         source: exportInfo.source,
         specifier: importNamespaceSpecifier(id),
      };
      matchImportAndExportName(
         importInfo,
         importLocalName,
         exportInfo,
         exportInfo.name,
         exportSource
      );
      bindImport(context, graph, parentModule, facadeImportInfo);
   }

   if (!importInfo.path.removed && !importInfo.path.node.specifiers.length) {
      importInfo.path.remove();
   }
}

function bindImport(
   context: TransformContext,
   graph: DependencyGraph,
   importer: ScriptDependency,
   importInfo: ImportInfo
) {
   if (importInfo.type == "specifier" || importInfo.type == "default") {
      const importedName =
         importInfo.type == "specifier"
            ? importInfo.specifier.imported.type == "Identifier"
               ? importInfo.specifier.imported.name
               : importInfo.specifier.imported.value
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
      const namespace = createNamespaceExport(context, namespacedModule);
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
   exportUidTracker.clear();
   namespaceMap.clear();
   exportUidTracker.assignWithModules(scriptModules);

   // Bind
   for (const module of scriptModules) {
      for (const importInfo of Object.values(module.imports.others)) {
         bindImport(context, graph, module, importInfo);
      }
   }

   // Build namespace templates
   for (const [source, namespace] of namespaceMap) {
      namespace.build();
   }

   // Remove left out imports/exports after binding
   for (const module of scriptModules) {
      const path = module.programPath;
      const { scope } = path;

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
