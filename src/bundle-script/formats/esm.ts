import {
   ExportAllDeclaration,
   ExportSpecifier,
   Identifier,
   ImportDeclaration,
   ImportDefaultSpecifier,
   ImportNamespaceSpecifier,
   ImportSpecifier,
   StringLiteral,
   exportAllDeclaration,
   exportNamedDeclaration,
   exportSpecifier,
   identifier,
   importDeclaration,
   importNamespaceSpecifier,
   importSpecifier,
   stringLiteral,
} from "@babel/types";
import { getLibImports } from "../utils/get-lib-imports";
import { getIdWithError, getNamespaceWithError } from "../utils/get-with-error";
import { renameBinding } from "../utils/renamer";
import { isValidVar } from "../utils/is-valid-var";
import { ModuleTransformer } from "../utils/module-transformer";
import { UidTracker, symbols } from "../link/UidTracker";
import { CompilationChunks } from "..";
import type { Toypack } from "src/types";

function getStringOrIdValue(node: StringLiteral | Identifier) {
   return node.type == "Identifier" ? node.name : node.value;
}

export function formatEsm(
   this: Toypack,
   uidTracker: UidTracker,
   chunks: CompilationChunks,
   moduleTransformers: ModuleTransformer[]
) {
   const modules = moduleTransformers.map((x) => x.module);
   const libImports = getLibImports(modules);
   const importDecls: Record<
      string,
      {
         namespaced?: ImportDeclaration;
         specified?: ImportDeclaration;
      }
   > = {};

   // Add each modules' imports
   for (const [source, portInfos] of Object.entries(libImports)) {
      const specifiers: Record<
         string,
         ImportDefaultSpecifier | ImportNamespaceSpecifier | ImportSpecifier
      > = {};
      const sourceStringNode = stringLiteral(source);
      importDecls[source] ??= {};
      let isSideEffect = false;
      let hasSpecifiers = false;
      for (const { portInfo, module } of portInfos) {
         isSideEffect = portInfo.type === "sideEffect";
         const moduleTransformer = moduleTransformers.find(
            (x) => x.module.source === module.source
         )!;
         if (
            portInfo.type != "default" &&
            portInfo.type != "specifier" &&
            portInfo.type != "namespace"
         ) {
            if (
               portInfo.type == "aggregatedAll" ||
               portInfo.type == "aggregatedName" ||
               portInfo.type == "aggregatedNamespace"
            ) {
               const newName = getNamespaceWithError.call(
                  this,
                  uidTracker,
                  source
               );
               importDecls[source].namespaced = importDeclaration(
                  [importNamespaceSpecifier(identifier(newName))],
                  sourceStringNode
               );
            }
            continue;
         }

         const { type, path, specifier } = portInfo;
         const importScope = path.scope;
         const local = specifier.local.name;
         const binding = importScope.getBinding(local)!;
         if (type == "specifier") {
            const imported = getStringOrIdValue(specifier.imported);
            const newName = getIdWithError.call(
               this,
               uidTracker,
               portInfo.source,
               imported
            );
            renameBinding(binding, newName, moduleTransformer);
            specifiers[newName] = importSpecifier(
               identifier(newName),
               specifier.imported
            );
            hasSpecifiers = true;
         } else if (type == "default") {
            const newName = getIdWithError.call(
               this,
               uidTracker,
               portInfo.source,
               "default"
            );
            renameBinding(binding, newName, moduleTransformer);
            specifiers[newName] = importSpecifier(
               identifier(newName),
               identifier("default")
            );
            hasSpecifiers = true;
         } else if (type == "namespace") {
            const newName = getNamespaceWithError.call(
               this,
               uidTracker,
               source
            );
            renameBinding(binding, newName, moduleTransformer);
            importDecls[source].namespaced ??= importDeclaration(
               [importNamespaceSpecifier(identifier(newName))],
               sourceStringNode
            );
         }
      }

      if (hasSpecifiers || isSideEffect) {
         importDecls[source].specified = importDeclaration(
            Object.values(specifiers),
            sourceStringNode
         );
      }
   }

   Object.values(importDecls).forEach(({ namespaced, specified }) => {
      if (specified) chunks.header.push(specified);
      if (namespaced) chunks.header.push(namespaced);
   });

   // Add entry's exports
   const entry = modules.find((x) => x.isEntry)!;
   const exportSpecifiers: Record<string, ExportSpecifier> = {};
   const entryExports = uidTracker.getModuleExports(entry.source);
   const aggrAllExports: ExportAllDeclaration[] = [];
   entryExports.forEach((id, name) => {
      const exported = isValidVar(name)
         ? identifier(name)
         : stringLiteral(name);
      if (typeof id === "string") {
         exportSpecifiers[name] = exportSpecifier(identifier(id), exported);
      } else if (id === symbols.aggregated) {
         const source = name;
         aggrAllExports.push(exportAllDeclaration(stringLiteral(source)));
      }
   });

   const exportSpecifiersArr = Object.values(exportSpecifiers);
   if (exportSpecifiersArr.length) {
      chunks.footer.push(exportNamedDeclaration(null, exportSpecifiersArr));
   }

   for (const decl of aggrAllExports) {
      chunks.footer.push(decl);
   }
}
