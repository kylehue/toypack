import { ScriptDependency } from "src/types";
import { UidGenerator } from "./UidGenerator";
import { Identifier, StringLiteral } from "@babel/types";
import path from "path-browserify";
import { getModulesMap } from "../utils/get-module-map";

function getStringOrIdValue(exported: StringLiteral | Identifier) {
   return exported.type == "Identifier" ? exported.name : exported.value;
}

function createDefaultName(source: string) {
   return path.basename(source) + "_default";
}

export namespace UidTracker {
   let _map: Record<
      string,
      {
         module: ScriptDependency;
         idMap: Record<string, string>;
      }
   > = {};
   let _namespaceMap: Record<string, string> = {};

   export function getNamespaceFor(source: string) {
      const namespace = _namespaceMap[source];
      if (!namespace) {
         throw new Error(`Namespace not found for ${source}`);
      }

      return _namespaceMap[source];
   }

   export function getAllNamespaces() {
      return Object.values(_namespaceMap);
   }

   export function get(source: string, exported: string): string | undefined {
      if (!_map[source]) return;

      const { idMap, module } = _map[source];
      let id: string | undefined = idMap[exported];
      if (!id) {
         /**
          * If export id is not found, try if it's in any of the
          * aggregated exports e.g.
          * export * from "./module.js";
          * export { name } from "./module.js";
          */
         for (const exportInfo of getExports(module)) {
            if (
               exportInfo.type != "aggregatedAll" &&
               exportInfo.type != "aggregatedName"
            ) {
               continue;
            }
            
            if (exportInfo.type == "aggregatedAll" && exported == "default") {
               continue;
            }

            return get(exportInfo.source, exported);
         }
      }

      return id;
   }

   export function clear() {
      _map = {};
      _namespaceMap = {};
   }

   export function getModuleExports(source: string) {
      return _map[source].idMap;
   }

   export function resyncModules(scriptModules: ScriptDependency[]) {
      const modulesMap = getModulesMap(scriptModules);

      for (const source in _namespaceMap) {
         if (!(source in modulesMap)) {
            delete _namespaceMap[source];
         }
      }

      for (const source in _map) {
         if (!(source in modulesMap)) {
            delete _map[source];
         }
      }
   }

   function getExports(module: ScriptDependency) {
      return [
         ...Object.values(module.exports.declared),
         ...Object.values(module.exports.declaredDefault),
         ...Object.values(module.exports.declaredDefaultExpression),
         ...Object.values(module.exports.aggregatedAll),
         ...Object.values(module.exports.aggregatedName),
         ...Object.values(module.exports.aggregatedNamespace),
      ];
   }

   export function assignWithModules(scriptModules: ScriptDependency[]) {
      resyncModules(scriptModules);

      // Set the module's id as a namespace
      for (const module of scriptModules) {
         if (_namespaceMap[module.source]) continue;
         _namespaceMap[module.source] = UidGenerator.generateBasedOnScope(
            module.programPath.scope,
            path.basename(module.source)
         );
      }

      // Initial add
      for (const module of scriptModules) {
         const { idMap } = (_map[module.source] ??= {
            module,
            idMap: {},
         });
         const scope = module.programPath.scope;
         getExports(module).forEach((exportInfo) => {
            const { type } = exportInfo;
            if (type == "aggregatedName") return;
            if (type == "aggregatedAll") return;
            let name, id;
            if (type == "declared") {
               name = exportInfo.name;
               if (idMap[name]) return;
               id = UidGenerator.generateBasedOnScope(
                  scope,
                  name == "default" ? createDefaultName(module.source) : name
               );
            } else if (type == "declaredDefault") {
               name = "default";
               if (idMap[name]) return;
               id = UidGenerator.generateBasedOnScope(
                  scope,
                  createDefaultName(module.source)
               );
            } else if (type == "declaredDefaultExpression") {
               name = "default";
               if (idMap[name]) return;
               id = UidGenerator.generateBasedOnScope(
                  scope,
                  createDefaultName(module.source)
               );
            } else {
               const { source } = exportInfo;
               const resolved = module.dependencyMap[source];
               name = exportInfo.specifier.exported.name;
               if (idMap[name]) return;
               id = _namespaceMap[resolved];
            }
            
            idMap[name] = id;
         });
      }

      // Fix implicit aggregates (ones that are bound to an import declaration)
      for (const module of scriptModules) {
         const { idMap } = (_map[module.source] ??= {
            module,
            idMap: {},
         });
         getExports(module).forEach((exportInfo) => {
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
               idMap[exportInfo.name] = _map[importSource].idMap[imported];
            } else if (specifier.type == "ImportDefaultSpecifier") {
               idMap[exportInfo.name] = _map[importSource].idMap["default"];
            } else if (specifier.type == "ImportNamespaceSpecifier") {
               idMap[exportInfo.name] = _namespaceMap[importSource];
            }
         });
      }

      console.log(_map);
   }
}
