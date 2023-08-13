import { NodePath } from "@babel/traverse";
import { Identifier, ImportDeclaration, StringLiteral } from "@babel/types";
import path from "path-browserify";
import { UidGenerator } from "./UidGenerator";
import { ERRORS, isLocal } from "../../utils";
import type {
   ScriptModule,
   ExportInfo,
   DeclaredDefaultExport,
   DeclaredExport,
   Toypack,
} from "src/types";
import { getResolvedWithError } from "../utils/get-with-error";

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
   this: Toypack,
   module: ScriptModule,
   exportInfo: DeclaredDefaultExport | DeclaredExport,
   importDeclaration: NodePath<ImportDeclaration>
) {
   const resolved = module.dependencyMap.get(
      importDeclaration.node.source.value
   );
   if (!resolved) {
      this._pushToDebugger(
         "error",
         ERRORS.any(`Redirected import is found but it cannot be resolved.`)
      );
      return;
   }
   const imports = module.getImports(["default", "specifier", "namespace"]);
   const imported = imports.find((x) => x.local === exportInfo.local);
   if (!imported) {
      this._pushToDebugger(
         "error",
         ERRORS.any(
            `Redirected import is found but its specifier is not found.`
         )
      );
      return;
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

export class UidTracker {
   private _map = new Map<
      string,
      {
         module?: ScriptModule;
         exportsIdMap: Map<string, string | RedirectedId>;
         namespace: string;
      }
   >();

   constructor(private _bundler: Toypack, public uidGenerator: UidGenerator) {}

   // TODO: remove?
   public reset() {
      this._map.clear();
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

   public getModuleExports(source: string, _visited = new Set<string>()) {
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
         const resolved = getResolvedWithError.call(
            this._bundler,
            module,
            exportInfo.source
         );

         // avoid circular error
         if (_visited.has(resolved)) continue;
         _visited.add(resolved);

         for (const [key, value] of this.getModuleExports(resolved, _visited)) {
            if (key == "default") continue;
            exports.set(key, value);
         }
      }

      // extract aggregated name exports because they're not in `exportsIdMap`
      const aggrNameExports =
         mapped.module?.getExports(["aggregatedName"]) || [];
      for (const exportInfo of aggrNameExports) {
         const module = mapped.module!;
         const resolved = getResolvedWithError.call(
            this._bundler,
            module,
            exportInfo.source
         );

         exports.set(
            exportInfo.name,
            this.get(resolved, exportInfo.specifier.local.name)!
         );
      }

      return exports;
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
                  id =
                     getImportedExportIdRedirection.call(
                        this._bundler,
                        module,
                        exportInfo,
                        importDecl
                     ) || "";
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
            const resolved = getResolvedWithError.call(
               this._bundler,
               module,
               source
            );

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
               this.uidGenerator.generateBasedOnScope(importInfo.path.scope, id)
            );
         }
      });
   }

   public assignWithModules(scriptModules: ScriptModule[]) {
      for (const module of scriptModules) {
         this._assignWithModule(module);
      }
   }
}

interface RedirectedId {
   to: string;
   name: string | Symbol;
}
