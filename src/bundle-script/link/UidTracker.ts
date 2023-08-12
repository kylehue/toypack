import { NodePath } from "@babel/traverse";
import { Identifier, ImportDeclaration, StringLiteral } from "@babel/types";
import path from "path-browserify";
import { UidGenerator } from "./UidGenerator";
import { getModulesMap } from "../utils/get-module-map";
import { isLocal } from "../../utils";
import type {
   ScriptModule,
   ExportInfo,
   DeclaredDefaultExport,
   DeclaredExport,
} from "src/types";

function getStringOrIdValue(exported: StringLiteral | Identifier) {
   return exported.type == "Identifier" ? exported.name : exported.value;
}

function createName(source: string) {
   return path.basename(source);
}

function createDefaultName(source: string) {
   return createName(source) + "_default";
}

function getImportDeclaration(exportInfo: ExportInfo) {
   if (exportInfo.type == "aggregatedAll") return;
   if (exportInfo.type == "aggregatedNamespace") return;
   if (exportInfo.type == "aggregatedName") return;
   const { declaration } = exportInfo;
   const importDecl = declaration.find((x) => x.isImportDeclaration());

   if (importDecl?.isImportDeclaration()) {
      return importDecl;
   }

   return;
}

/**
 * Used to get the id of an export that is from an import e.g.
 *
 * ```js
 * import { foo } from "/module.js";
 * export { foo };
 * ```
 *
 * Since `foo` was imported and exported from "/module.js", then its id should
 * be the one that's in "/module.js"
 *
 * @param module The module where the export is declared.
 * @param exportInfo The ExportInfo object of the export declaration.
 * @param importDeclaration The import declaration that references the export.
 * @returns An object representing the redirection of the id.
 */
function getImportedExportIdRedirection(
   module: ScriptModule,
   exportInfo: DeclaredDefaultExport | DeclaredExport,
   importDeclaration: NodePath<ImportDeclaration>
) {
   const resolved = module.dependencyMap.get(
      importDeclaration.node.source.value
   )!;
   if (!resolved) {
      throw new Error(`Redirected import is found but it cannot be resolved.`);
   }
   const imports = module.getImports(["default", "specifier", "namespace"]);
   const imported = imports.find((x) => x.local === exportInfo.local);
   if (!imported) {
      throw new Error(
         `Redirected import is found but its specifier is not found.`
      );
   }
   let importedName;
   if (imported.type == "default") {
      importedName = "default";
   } else if (imported.type == "namespace") {
      importedName = symbols.namespace;
   } else {
      importedName = getStringOrIdValue(imported.specifier.imported);
   }

   const redirectId: RedirectedId = {
      name: importedName,
      to: resolved,
   };

   return redirectId;
}

const symbols = {
   namespace: Symbol("Namespace"),
};

interface RedirectedId {
   to: string;
   name: string | Symbol;
}

export class UidTracker {
   private _map = new Map<
      string,
      {
         module?: ScriptModule;
         exportsIdMap: Map<string, string | RedirectedId>;
         namespace: string;
      }
   >();

   constructor(public uidGenerator: UidGenerator) {}

   public reset() {
      this._map.clear();
   }

   public remove(source: string) {
      this._map.delete(source);
   }

   public getNamespaceFor(source: string) {
      const namespace = this._map.get(source)?.namespace;
      return namespace;
   }

   public getAllNamespaces() {
      const namespaces: string[] = [];
      for (const [_, data] of this._map) {
         namespaces.push(data.namespace);
      }

      return namespaces;
   }

   public get(source: string, name: string): string | undefined {
      const data = this._map.get(source);
      if (!data) return;
      const { module, exportsIdMap } = data;
      let supposedId = exportsIdMap.get(name);
      let id = typeof supposedId == "string" ? supposedId : undefined;
      if (!supposedId && module) {
         /**
          * If export id is not found, try if it's in any of the
          * aggregated exports e.g.
          * export * from "./module.js";
          * export { name } from "./module.js";
          */
         if (name !== "default") {
            for (const exportInfo of module.getExports(["aggregatedAll"])) {
               const resolved = module.dependencyMap.get(exportInfo.source)!;
               id = this.get(resolved, name);
               if (id) break;
            }
         }

         for (const exportInfo of module.getExports(["aggregatedName"])) {
            if (exportInfo.name !== name) continue;
            const resolved = module.dependencyMap.get(exportInfo.source)!;
            const local = getStringOrIdValue(exportInfo.specifier.local);
            id = this.get(resolved, local);
            if (id) break;
         }
      }

      if (supposedId && typeof supposedId != "string") {
         if (typeof supposedId.name === "string") {
            id = this.get(supposedId.to, supposedId.name);
         } else if (supposedId.name === symbols.namespace) {
            id = this.getNamespaceFor(supposedId.to);
         }
      }

      return id;
   }

   public getModuleExports(source: string) {
      const exports = new Map<string, string>();
      const mapped = this._map.get(source);
      if (!mapped) return exports;
      for (const [name] of mapped.exportsIdMap) {
         exports.set(name, this.get(source, name)!);
      }

      // extract aggregated * exports because they're not in `exportsIdMap`
      const aggrAllExports = mapped.module?.getExports(["aggregatedAll"]) || [];
      for (const exportInfo of aggrAllExports) {
         const module = mapped.module!;
         const resolved = module.dependencyMap.get(exportInfo.source);
         if (!resolved) {
            throw new Error(
               `Failed to resolve '${exportInfo.source}' in ${module.source}.`
            );
         }

         for (const [key, value] of this.getModuleExports(resolved)) {
            if (key == "default") continue;
            exports.set(key, value);
         }
      }

      // extract aggregated name exports because they're not in `exportsIdMap`
      const aggrNameExports =
         mapped.module?.getExports(["aggregatedName"]) || [];
      for (const exportInfo of aggrNameExports) {
         const module = mapped.module!;
         const resolved = module.dependencyMap.get(exportInfo.source);
         if (!resolved) {
            throw new Error(
               `Failed to resolve '${exportInfo.source}' in ${module.source}.`
            );
         }

         exports.set(
            exportInfo.name,
            this.get(resolved, exportInfo.specifier.local.name)!
         );
      }

      return exports;
   }

   public resyncModules(scriptModules: ScriptModule[]) {
      const modulesMap = getModulesMap(scriptModules);

      // delete module
      for (const [source, mapped] of this._map) {
         if (!isLocal(source)) continue;
         const stillExists = source in modulesMap;
         if (stillExists) {
            mapped.module = modulesMap[source];
         } else {
            this._map.delete(source);
         }
      }

      // delete id maps
      for (const module of scriptModules) {
         const mapped = this._map.get(module.source);
         if (!mapped) continue;
         const { exportsIdMap } = mapped;
         const exports = module
            .getExports([
               "aggregatedNamespace",
               "declared",
               "declaredDefault",
               "declaredDefaultExpression",
            ])
            .reduce((acc, cur) => {
               acc[cur.name] = cur;
               return acc;
            }, {} as Record<string, ExportInfo>);

         for (const [name, _] of exportsIdMap) {
            if (exports[name]) continue;
            exportsIdMap.delete(name);
         }
      }
   }

   private _instantiateModule(module: ScriptModule) {
      if (this._map.has(module.source)) return;
      this._map.set(module.source, {
         module,
         exportsIdMap: new Map(),
         namespace: this.uidGenerator.generateBasedOnScope(
            module.programPath.scope,
            path.basename(module.source)
         ),
      });
   }

   public instantiateModules(modules: ScriptModule[]) {
      for (const module of modules) {
         this._instantiateModule(module);
      }
   }

   private _assignWithModule(module: ScriptModule) {
      this._instantiateModule(module);

      // Initial add
      const { exportsIdMap } = this._map.get(module.source)!;
      const exports = module.getExports([
         "declared",
         "declaredDefault",
         "declaredDefaultExpression",
         "aggregatedNamespace",
      ]);

      /**
       * Used to assure that there's only 1 id per declaration.
       *
       * For example, if a declaration is exported multiple times
       * with different aliases e.g.
       *
       * export function fn() {}
       * export { fn as alias1 };
       * export { fn as alias2 };
       *
       * Then those aliases should point to 1 id.
       *
       * Also note that this is only for declared exports because
       * other export types can't possibly have aliases.
       */
      const assignedDeclIds = new Map<string, string | RedirectedId>();

      exports.forEach((exportInfo) => {
         const { type } = exportInfo;
         let name: string | undefined;
         if (
            type == "declared" ||
            type == "declaredDefault" ||
            type == "declaredDefaultExpression"
         ) {
            name = exportInfo.name;
            const assignedDeclId = exportInfo.identifier
               ? assignedDeclIds.get(exportInfo.identifier.name)
               : undefined;
            if (assignedDeclId) {
               exportsIdMap.set(name, assignedDeclId);
            } else if (!exportsIdMap.has(name)) {
               let id: string | RedirectedId;

               const importDecl = getImportDeclaration(exportInfo);
               if (
                  importDecl &&
                  (exportInfo.type == "declared" ||
                     exportInfo.type == "declaredDefault")
               ) {
                  // redirect if it's from an import
                  id = getImportedExportIdRedirection(
                     module,
                     exportInfo,
                     importDecl
                  );
               } else {
                  id = this.uidGenerator.generateBasedOnScope(
                     exportInfo.path.scope,
                     name == "default" ? createDefaultName(module.source) : name
                  );
               }

               exportsIdMap.set(name, id);
               if (exportInfo.identifier) {
                  assignedDeclIds.set(exportInfo.identifier.name, id);
               }
            }
         } else if (type == "aggregatedNamespace") {
            const { source } = exportInfo;
            const resolved = module.dependencyMap.get(source);

            if (!resolved) {
               throw new Error(
                  `Failed to resolve '${source}' in ${module.source}.`
               );
            }

            name = exportInfo.specifier.exported.name;
            exportsIdMap.set(name, {
               to: resolved,
               name: symbols.namespace,
            });
         }
      });

      // for external imports
      module.getImports().forEach((importInfo) => {
         const { type, source } = importInfo;
         if (isLocal(source)) return;
         let data = this._map.get(source);
         if (!data) {
            data = {
               exportsIdMap: new Map(),
               namespace: this.uidGenerator.generateBasedOnScope(
                  importInfo.path.scope,
                  createName(source)
               ),
            };
            this._map.set(source, data);
         }

         const { exportsIdMap } = data;

         let name, id;
         if (type == "default") {
            name = "default";
            id = createDefaultName(source);
         } else if (type == "specifier") {
            name = getStringOrIdValue(importInfo.specifier.imported);
            id = name == "default" ? createDefaultName(module.source) : name;
         }

         if (name && id && !exportsIdMap.has(name)) {
            exportsIdMap.set(
               name,
               this.uidGenerator.generateBasedOnScope(
                  importInfo.path.scope,
                  id
               )
            );
         }
      });
   }

   public assignWithModules(scriptModules: ScriptModule[]) {
      this.resyncModules(scriptModules);

      // Instantiate
      for (const module of scriptModules) {
         this._assignWithModule(module);
      }
   }
}
