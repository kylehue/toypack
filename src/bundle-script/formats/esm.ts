import {
   ExportSpecifier,
   Identifier,
   ImportDeclaration,
   ImportDefaultSpecifier,
   ImportNamespaceSpecifier,
   ImportSpecifier,
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
import { getIdWithError, getNamespaceWithError } from "../utils/get-with-error";
import { renameBinding } from "../utils/renamer";
import { CompilationChunks } from "..";
import type { ScriptModule, Toypack } from "src/types";
import { isValidVar } from "../utils/is-valid-var";

function getStringOrIdValue(node: StringLiteral | Identifier) {
   return node.type == "Identifier" ? node.name : node.value;
}

export function formatEsm(
   this: Toypack,
   chunks: CompilationChunks,
   scriptModules: ScriptModule[]
) {
   const libImports = getLibImports(scriptModules);
   const importDecls: Record<
      string,
      {
         namespaced?: ImportDeclaration;
         specified?: ImportDeclaration;
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
            specifiers[id] = importSpecifier(
               identifier(id),
               specifier.imported
            );
         } else if (type == "default") {
            const id = getIdWithError.call(this, importInfo.source, "default");
            renameBinding(module, binding, id);
            specifiers[id] = importSpecifier(
               identifier(id),
               identifier("default"),
            );
         } else if (type == "namespace") {
            const id = getNamespaceWithError.call(this, source);
            renameBinding(module, binding, id);
            importDecls[source].namespaced ??= importDeclaration(
               [importNamespaceSpecifier(identifier(id))],
               sourceStringNode
            );
         }
      }

      importDecls[source].specified = importDeclaration(
         Object.values(specifiers),
         sourceStringNode
      );
   }

   Object.values(importDecls).forEach(({ namespaced, specified }) => {
      if (specified) chunks.header.push(specified);
      if (namespaced) chunks.header.push(namespaced);
   });

   // Add entry's exports
   const entry = scriptModules.find((x) => x.isEntry)!;
   const exportSpecifiers: Record<string, ExportSpecifier> = {};
   const entryExports = this._uidTracker.getModuleExports(entry.source);
   entryExports.forEach((id, name) => {
      const exported = isValidVar(name)
         ? identifier(name)
         : stringLiteral(name);
      exportSpecifiers[name] = exportSpecifier(identifier(id), exported);
   });

   const exportSpecifiersArr = Object.values(exportSpecifiers);
   if (exportSpecifiersArr.length) {
      chunks.footer.push(exportNamedDeclaration(null, exportSpecifiersArr));
   }
}
