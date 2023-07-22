import { DependencyGraph, ScriptDependency } from "src/parse";
import { ImportInfo } from "src/parse/extract-imports";
import {
   AggregatedNamespaceExport,
   ExportInfo,
} from "src/parse/extract-exports";
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
   isFunctionDeclaration,
   isClassDeclaration,
   isBlockScoped,
   importNamespaceSpecifier,
} from "@babel/types";
import traverse, { NodePath, Scope } from "@babel/traverse";
import { template } from "@babel/core";
import { getSortedScripts } from "../utils/get-sorted-scripts";
import path from "path-browserify";
import runtime from "../runtime";
import { TransformContext } from "../utils/transform-context";
import { addReservedVars, generateUid } from "../utils";

function getImportedName(specifier: ImportSpecifier) {
   const { imported } = specifier;
   return imported.type == "Identifier" ? imported.name : imported.value;
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
   const parentSource = importer.dependencyMap[importInfo.source];
   const parentModule = graph[parentSource] as ScriptDependency;
   const aggrSource = parentModule.dependencyMap[exportInfo.source];
   const aggrModule = graph[aggrSource] as ScriptDependency;
   return aggrModule;
}

type Replacers = Record<string, Identifier | string>;
const namespaceMap = new Map<
   string,
   {
      namespace: string;
      build: (replacers: Replacers) => void;
   }
>();

let namespaceReplacers: Record<string, Replacers> = {};

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
   module: ScriptDependency,
   name: string
) {
   const declared = namespaceMap.get(module.source);
   if (declared) {
      return declared.namespace;
   }

   name = generateUid(name);

   namespaceMap.set(module.source, {
      namespace: name,
      build(replacers: Replacers) {
         const exportEntries = Object.entries(module.exports);
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

               let line = `${exportName}: () => %%${exportName}%%`;
               return line;
            })
            .join(",\n");

         const buildTemplate = template(`
            var ${name} = {};
            __export(${name}, {\n${formattedExports}\n});
         `);

         const builtTemplate = buildTemplate(replacers);
         context.addRuntime("__export");
         context.unshiftAst(builtTemplate, module.source);
      },
   });

   return name;
}

const exportDeclarationUIDMap = new Map<string, string>();
/** Gets the assigned UID of the exported declaration. */
function getExportUid(exportInfo: ExportInfo, name?: string) {
   let uid = exportDeclarationUIDMap.get(exportInfo.id);
   if (!uid) {
      uid = generateUid(name);
      addReservedVars(uid);
   }

   exportDeclarationUIDMap.set(exportInfo.id, uid);

   return uid;
}

function matchImportAndExportName(
   importInfo: ImportInfo,
   importName: string,
   exportInfo: ExportInfo,
   exportName: string
) {
   const exportScope = exportInfo.path.scope;
   const importScope = importInfo.path.scope;
   const uid = getExportUid(exportInfo, importName);
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
   const nmSource = importer.dependencyMap[importInfo.source];

   namespaceReplacers[nmSource] ??= {};
   if (exportInfo.type == "declared") {
      const id = exportInfo.identifier;
      matchImportAndExportName(
         importInfo,
         importLocalName,
         exportInfo,
         id.name
      );

      namespaceReplacers[nmSource][exportInfo.name] = id;

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
            declPath.node.id = identifier(generateUid("default"));
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
            id.name
         );

         namespaceReplacers[nmSource][exportInfo.name] = id;

         importScope.getBinding(id.name)?.path.remove();
      } else {
         // id should be guaranteed when vars are exported as default
         const id = exportInfo.identifier!;
         matchImportAndExportName(
            importInfo,
            importLocalName,
            exportInfo,
            id.name
         );

         namespaceReplacers[nmSource][exportInfo.name] = id;

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
      const id = identifier(generateUid("default"));
      const varDecl = variableDeclaration("var", [
         variableDeclarator(id, exportInfo.declaration.node),
      ]);
      const [varDeclPath] = exportInfo.path.replaceWith(varDecl);
      exportScope.registerDeclaration(varDeclPath);
      matchImportAndExportName(
         importInfo,
         importLocalName,
         exportInfo,
         id.name
      );
      namespaceReplacers[nmSource][exportInfo.name] = id;
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
         id: exportInfo.id,
         type: "namespace",
         path: importInfo.path,
         source: exportInfo.source,
         specifier: importNamespaceSpecifier(id),
      };
      bindImport(context, graph, parentModule, facadeImportInfo);
      namespaceReplacers[nmSource][exportInfo.name] = id;
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
            ? getImportedName(importInfo.specifier)
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
      const namespace = createNamespaceExport(
         context,
         namespacedModule,
         localName
      );
      Object.entries(namespacedModule.exports).forEach(([name, exportInfo]) => {
         bindExported(context, graph, importer, importInfo, exportInfo, name);
         // matchImportAndExportName(importInfo, namespace, exportInfo, name);
      });
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
   exportDeclarationUIDMap.clear();
   namespaceMap.clear();
   namespaceReplacers = {};

   // Bind
   for (const module of scriptModules) {
      for (const importInfo of Object.values(module.imports)) {
         bindImport(context, graph, module, importInfo);
      }
   }

   // Build namespace templates
   console.log(namespaceReplacers);
   
   for (const [source, namespace] of namespaceMap) {
      namespace.build(namespaceReplacers[source]);
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
