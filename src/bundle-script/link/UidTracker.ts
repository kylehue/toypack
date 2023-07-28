import { ScriptDependency } from "src/types";
import { UidGenerator } from "./UidGenerator";
import { Identifier, StringLiteral } from "@babel/types";
import path from "path-browserify";

function getStringOrIdValue(exported: StringLiteral | Identifier) {
   return exported.type == "Identifier" ? exported.name : exported.value;
}

function createDefaultName(source: string) {
   return path.basename(source) + "_default";
}

export namespace UidTracker {
   let _map: Record<string, Record<string, string>> = {};
   let _namespaceMap: Record<string, string> = {};
   export function set(source: string, exported: string, id: string) {
      _map[source] ??= {};
      _map[source][exported] = id;
      return id;
   }

   export function getNamespaceFor(source: string) {
      return _namespaceMap[source] || undefined;
   }

   export function get(source: string, exported: string) {
      const group = _map[source];
      if (group) {
         return group[exported];
      }
   }

   export function clear() {
      _map = {};
      _namespaceMap = {};
   }

   export function getModuleExports(source: string) {
      return _map[source];
   }

   export function assignWithModules(scriptModules: ScriptDependency[]) {
      // Set the module's id as a namespace
      for (const module of scriptModules) {
         _namespaceMap[module.source] = UidGenerator.generate(
            path.basename(module.source)
         );
      }

      // Initial add
      for (const module of scriptModules) {
         const idMap = (_map[module.source] ??= {});
         Object.values(module.exports.others).forEach((exportInfo) => {
            const { type } = exportInfo;
            if (type == "aggregatedName") return;
            let name, id;
            if (type == "declared") {
               name = exportInfo.name;
               id = UidGenerator.generate(
                  name == "default" ? createDefaultName(module.source) : name
               );
            } else if (type == "declaredDefault") {
               name = "default";
               id = UidGenerator.generate(createDefaultName(module.source));
            } else if (type == "declaredDefaultExpression") {
               name = "default";
               id = UidGenerator.generate(createDefaultName(module.source));
            } else {
               const { source } = exportInfo;
               const resolved = module.dependencyMap[source];
               name = exportInfo.specifier.exported.name;
               id = _namespaceMap[resolved];
            }
            idMap[name] = id;
         });
      }

      // Fix implicit aggregates (ones that are bound to an import declaration)
      for (const module of scriptModules) {
         const idMap = (_map[module.source] ??= {});
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
               idMap[exportInfo.name] = _map[importSource][imported];
            } else if (specifier.type == "ImportDefaultSpecifier") {
               idMap[exportInfo.name] = _map[importSource]["default"];
            } else if (specifier.type == "ImportNamespaceSpecifier") {
               idMap[exportInfo.name] = _namespaceMap[importSource];
            }
         });
      }

      // Now add the aggregated named exports
      for (const module of scriptModules) {
         const idMap = (_map[module.source] ??= {});
         Object.values(module.exports.others).forEach((exportInfo) => {
            const { type } = exportInfo;
            if (type != "aggregatedName") return;
            const { source } = exportInfo;
            const resolved = module.dependencyMap[source];
            idMap[exportInfo.name] =
               _map[resolved][exportInfo.specifier.local.name];
         });
      }

      // Lastly, the aggregated star exports
      for (const module of scriptModules) {
         const idMap = (_map[module.source] ??= {});
         module.exports.aggregatedAll.forEach((exportInfo) => {
            const { source } = exportInfo;
            const resolved = module.dependencyMap[source];
            const aggrExports = _map[resolved];
            for (const [key, value] of Object.entries(aggrExports)) {
               if (key == "default") continue;
               idMap[key] = value;
            }
         });
      }

      console.log(_map);
   }
}
