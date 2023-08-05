import {
   ExportSpecifier,
   File,
   Identifier,
   ImportDeclaration,
   ImportDefaultSpecifier,
   ImportNamespaceSpecifier,
   ImportSpecifier,
   Statement,
   StringLiteral,
   exportNamedDeclaration,
   exportSpecifier,
   identifier,
   importDeclaration,
   importDefaultSpecifier,
   importNamespaceSpecifier,
   importSpecifier,
   stringLiteral,
} from "@babel/types";
import { getLibImports } from "../utils/get-lib-imports";
import {
   getIdWithError,
   getNamespaceWithError,
   resolveWithError,
} from "../utils/get-with-error";
import type { ScriptModule, Toypack } from "src/types";
import { renameBinding } from "../utils/renamer";

function getStringOrIdValue(node: StringLiteral | Identifier) {
   return node.type == "Identifier" ? node.name : node.value;
}

export function formatEsm(this: Toypack, scriptModules: ScriptModule[]) {
   const libImports = getLibImports(scriptModules);
   const importDecls: Record<
      string,
      {
         namespace?: ImportDeclaration;
         others?: ImportDeclaration;
      }
   > = {};

   // Add each modules' imports
   for (const [source, importInfos] of Object.entries(libImports)) {
      const specifiers: Record<
         string,
         ImportDefaultSpecifier | ImportNamespaceSpecifier | ImportSpecifier
      > = {};
      importDecls[source] ??= {};
      const sourceStringNode = stringLiteral(source);
      for (const { importInfo, module } of importInfos) {
         if (
            importInfo.type != "default" &&
            importInfo.type != "specifier" &&
            importInfo.type != "namespace"
         ) {
            continue;
         }

         const { type, path, specifier } = importInfo;
         const importScope = path.scope;
         const local = specifier.local.name;
         const binding = importScope.getBinding(local)!;
         if (type == "specifier") {
            const imported = getStringOrIdValue(specifier.imported);
            const id = getIdWithError.call(this, importInfo.source, imported);
            renameBinding(module, binding, id);
            // importScope.rename(local, id);
            specifiers[id] = importSpecifier(
               identifier(id),
               specifier.imported
            );
         } else if (type == "default") {
            const id = getIdWithError.call(this, importInfo.source, "default");
            renameBinding(module, binding, id);
            // importScope.rename(local, id);
            specifiers[id] = importDefaultSpecifier(identifier(id));
         } else if (type == "namespace") {
            const id = getNamespaceWithError.call(this, source);
            renameBinding(module, binding, id);
            // importScope.rename(local, id);
            importDecls[source].namespace ??= importDeclaration(
               [importNamespaceSpecifier(identifier(id))],
               sourceStringNode
            );
         }
      }

      importDecls[source].others = importDeclaration(
         Object.values(specifiers),
         sourceStringNode
      );
   }

   const header: Statement[] = [];

   Object.values(importDecls).forEach(({ namespace, others }) => {
      if (others) header.push(others);
      if (namespace) header.push(namespace);
   });

   // Add entry's exports
   const entry = scriptModules.find((x) => x.isEntry)!;
   const exportSpecifiers: Record<string, ExportSpecifier> = {};
   [
      ...Object.values(entry.exports.declared),
      ...Object.values(entry.exports.declaredDefault),
      ...Object.values(entry.exports.declaredDefaultExpression),
      ...Object.values(entry.exports.aggregatedName),
      ...Object.values(entry.exports.aggregatedNamespace),
   ].forEach((exportInfo) => {
      const { type, path } = exportInfo;
      const id = getIdWithError.call(this, entry.source, exportInfo.name);
      if (!id) return;
      if (
         type == "declared" ||
         type == "aggregatedName" ||
         type == "aggregatedNamespace"
      ) {
         exportSpecifiers[id] = exportSpecifier(
            identifier(id),
            identifier(exportInfo.name)
         );
      } else if (type == "declaredDefault") {
         exportSpecifiers["default"] = exportSpecifier(
            identifier(id),
            identifier("default")
         );
      } else if (type == "declaredDefaultExpression") {
         exportSpecifiers["default"] = exportSpecifier(
            identifier(id),
            identifier("default")
         );
      }
   });

   Object.values(entry.exports.aggregatedAll).forEach((exportInfo) => {
      const { source } = exportInfo;
      const resolved = resolveWithError(entry, source);
      const aggrExports = this._uidTracker.getModuleExports(resolved);
      for (const [name, id] of aggrExports) {
         if (name == "default") continue;
         exportSpecifiers[id] = exportSpecifier(
            identifier(id),
            identifier(name)
         );
      }
   });

   const footer: Statement[] = [];
   const exportSpecifiersArr = Object.values(exportSpecifiers);
   if (exportSpecifiersArr.length) {
      footer.push(exportNamedDeclaration(null, exportSpecifiersArr));
   }

   return { header, footer };
}
