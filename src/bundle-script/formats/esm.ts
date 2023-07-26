import {
   ExportSpecifier,
   File,
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
import { ScriptDependency } from "src/parse";
import { getLibImports } from "../utils/get-lib-imports";
import { UidGenerator } from "../link/UidGenerator";
import { UidTracker } from "../link/UidTracker";

function getStringOrIdValue(node: StringLiteral | Identifier) {
   return node.type == "Identifier" ? node.name : node.value;
}

export function formatEsm(ast: File, scriptModules: ScriptDependency[]) {
   const body = ast.program.body;
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
      const idMap: Record<string, string> = {};
      const namespaceMap: Record<string, string> = {};
      const specifiers: Record<
         string,
         ImportDefaultSpecifier | ImportNamespaceSpecifier | ImportSpecifier
      > = {};
      importDecls[source] ??= {};
      const sourceStringNode = stringLiteral(source);
      for (const importInfo of importInfos) {
         if (
            importInfo.type != "default" &&
            importInfo.type != "specifier" &&
            importInfo.type != "namespace"
         ) {
            continue;
         }
         
         const { type, path, specifier } = importInfo;
         const scope = path.scope;
         const local = specifier.local.name;
         if (type == "specifier") {
            const imported = getStringOrIdValue(specifier.imported);
            const id = (idMap[imported] ??= UidGenerator.generate(imported));
            scope.rename(local, id);
            specifiers[id] = importSpecifier(
               identifier(id),
               specifier.imported
            );
         } else if (type == "default") {
            const id = (idMap["default"] ??= UidGenerator.generate(
               source.split("/")[0] + "_default"
            ));
            scope.rename(local, id);
            specifiers[id] = importDefaultSpecifier(identifier(id));
         } else if (type == "namespace") {
            const id = (namespaceMap[source] ??= UidGenerator.generate(
               source.split("/")[0]
            ));
            scope.rename(local, id);
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

   Object.values(importDecls).forEach(({ namespace, others }) => {
      if (others) {
         body.unshift(others);
      }
      if (namespace) {
         body.unshift(namespace);
      }
   });

   // Add entry's exports
   const entry = scriptModules.find((x) => x.isEntry)!;
   const exportSpecifiers: Record<string, ExportSpecifier> = {};
   Object.values(entry.exports.others).forEach((exportInfo) => {
      const { type, path } = exportInfo;
      const id = UidTracker.get(entry.source, exportInfo.name);
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

   entry.exports.aggregatedAll.forEach((exportInfo) => {
      const { source } = exportInfo;
      const resolved = entry.dependencyMap[source];
      const aggrExports = UidTracker.getModuleExports(resolved);
      for (const [name, id] of Object.entries(aggrExports)) {
         if (name == "default") continue;
         exportSpecifiers[id] = exportSpecifier(
            identifier(id),
            identifier(name)
         );
      }
   });

   const exportSpecifiersArr = Object.values(exportSpecifiers);
   if (exportSpecifiersArr.length) {
      body.push(exportNamedDeclaration(null, exportSpecifiersArr));
   }
}
