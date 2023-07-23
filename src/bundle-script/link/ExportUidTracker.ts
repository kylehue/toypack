import { ScriptDependency } from "src/types";
import { generateUid } from "../utils";
import { Identifier, StringLiteral } from "@babel/types";
import path from "path-browserify";

function getStringOrIdValue(exported: StringLiteral | Identifier) {
   return exported.type == "Identifier" ? exported.name : exported.value;
}

function createDefaultName(source: string) {
   return path.basename(source) + "_default";
}

export class ExportUidTracker {
   private _map: Record<string, Record<string, string>> = {};
   private _namespaceMap: Record<string, string> = {};
   set(source: string, exported: string, id: string) {
      this._map[source] ??= {};
      this._map[source][exported] = id;
      return id;
   }

   getNamespaceFor(source: string) {
      return this._namespaceMap[source] || undefined;
   }

   get(source: string, exported: string) {
      const group = this._map[source];
      if (group) {
         return group[exported];
      }
   }

   clear() {
      this._map = {};
      this._namespaceMap = {};
   }

   assignWithModules(scriptModules: ScriptDependency[]) {
      // Set the module's id as a namespace
      for (const module of scriptModules) {
         this._namespaceMap[module.source] = generateUid(
            path.basename(module.source)
         );
      }

      // Initial add
      for (const module of scriptModules) {
         const idMap = (this._map[module.source] ??= {});
         Object.values(module.exports.others).forEach((exportInfo) => {
            const { type } = exportInfo;
            if (type == "aggregatedName") return;
            let name, id;
            if (type == "declared") {
               name = exportInfo.name;
               id = exportInfo.identifier.name;
            } else if (type == "declaredDefault") {
               name = "default";
               id = exportInfo.identifier?.name || generateUid(exportInfo.name);
            } else if (type == "declaredDefaultExpression") {
               name = "default";
               id = generateUid(createDefaultName(module.source));
            } else {
               const { source } = exportInfo;
               const resolved = module.dependencyMap[source];
               name = exportInfo.specifier.exported.name;
               id = this._namespaceMap[resolved];
            }
            idMap[name] = id;
         });
      }

      // Fix implicit aggregates (ones that are bound to an import declaration)
      for (const module of scriptModules) {
         const idMap = (this._map[module.source] ??= {});
         Object.values(module.exports.others).forEach((exportInfo) => {
            const { type } = exportInfo;
            if (
               type != "declared" &&
               type != "declaredDefault" &&
               type != "declaredDefaultExpression"
            ) {
               return;
            }
            const { declaration } = exportInfo;
            const { parentPath } = declaration;
            if (!parentPath.isImportDeclaration()) {
               return;
            }
            const importSource =
               module.dependencyMap[parentPath.node.source.value];
            const specifier = declaration.node;
            if (specifier.type == "ImportSpecifier") {
               const imported = getStringOrIdValue(specifier.imported);
               idMap[exportInfo.name] = this._map[importSource][imported];
            } else if (specifier.type == "ImportDefaultSpecifier") {
               idMap[exportInfo.name] = this._map[importSource]["default"];
            } else if (specifier.type == "ImportNamespaceSpecifier") {
               idMap[exportInfo.name] = this._namespaceMap[importSource];
            }
         });
      }

      // Now add the aggregated named exports
      for (const module of scriptModules) {
         const idMap = (this._map[module.source] ??= {});
         Object.values(module.exports.others).forEach((exportInfo) => {
            const { type } = exportInfo;
            if (type != "aggregatedName") return;
            const { source } = exportInfo;
            const resolved = module.dependencyMap[source];
            idMap[exportInfo.name] =
               this._map[resolved][exportInfo.specifier.local.name];
         });
      }

      // Lastly, the aggregated star exports
      for (const module of scriptModules) {
         const idMap = (this._map[module.source] ??= {});
         module.exports.aggregatedAll.forEach((exportInfo) => {
            const { source } = exportInfo;
            const resolved = module.dependencyMap[source];
            const aggrExports = this._map[resolved];
            for (const [key, value] of Object.entries(aggrExports)) {
               idMap[key] = value;
            }
         });
      }
   }
}
