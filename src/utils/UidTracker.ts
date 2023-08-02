import { Identifier, StringLiteral } from "@babel/types";
import path from "path-browserify";
import { UidGenerator } from "./UidGenerator";
import { getModulesMap } from "../bundle-script/utils/get-module-map";
import { isLocal } from ".";
import type { ScriptModule, ExportInfo } from "src/types";

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

const symbols = {
   namespace: Symbol("Namespace"),
};

interface Redirect {
   to: string;
   name: string | Symbol;
}

export class UidTracker {
   private _map = new Map<
      string,
      {
         module?: ScriptModule;
         idMap: Map<string, string | Redirect>;
         namespace: string;
      }
   >();

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
      const { module, idMap } = data;
      let supposedId = idMap.get(name);
      let id = typeof supposedId == "string" ? supposedId : undefined;
      if (!supposedId && module) {
         /**
          * If export id is not found, try if it's in any of the
          * aggregated exports e.g.
          * export * from "./module.js";
          * export { name } from "./module.js";
          */
         for (const exportInfo of module.getExports([
            "aggregatedAll",
            "aggregatedName",
         ])) {
            if (exportInfo.type == "aggregatedAll" && name == "default") {
               continue;
            }

            id = this.get(exportInfo.source, name);
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
      const data = this._map.get(source);
      if (!data) return exports;
      for (const [name, id] of data.idMap) {
         exports.set(name, this.get(source, name)!);
      }
      return exports;
   }

   public resyncModules(scriptModules: ScriptModule[]) {
      const modulesMap = getModulesMap(scriptModules);

      for (const [source, _] of this._map) {
         if (!(source in modulesMap)) {
            this._map.delete(source);
         }
      }
   }

   public assignWithModules(
      uidGenerator: UidGenerator,
      scriptModules: ScriptModule[]
   ) {
      this.resyncModules(scriptModules);

      // Instantiate
      for (const module of scriptModules) {
         if (this._map.has(module.source)) continue;
         this._map.set(module.source, {
            module,
            idMap: new Map(),
            namespace: uidGenerator.generateBasedOnScope(
               module.programPath.scope,
               path.basename(module.source)
            ),
         });
      }

      // Initial add
      for (const module of scriptModules) {
         const { idMap } = this._map.get(module.source)!;

         const exports = module.getExports([
            "declared",
            "declaredDefault",
            "declaredDefaultExpression",
            "aggregatedNamespace",
         ]);

         exports.forEach((exportInfo) => {
            const { type } = exportInfo;
            let name: string | undefined;
            if (
               type == "declared" ||
               type == "declaredDefault" ||
               type == "declaredDefaultExpression"
            ) {
               name = exportInfo.name;
               if (!idMap.has(name)) {
                  idMap.set(
                     name,
                     uidGenerator.generateBasedOnScope(
                        exportInfo.path.scope,
                        name == "default"
                           ? createDefaultName(module.source)
                           : name
                     )
                  );
               }
            } else {
               const { source } = exportInfo;
               const resolved = module.dependencyMap.get(source);

               if (!resolved) {
                  throw new Error(`Failed to resolve '${source}'.`);
               }

               name = exportInfo.specifier.exported.name;
               idMap.set(name, {
                  to: resolved,
                  name: symbols.namespace,
               });
            }

            /**
             * Redirect import ids to the exported ids e.g.
             * // main.js
             * import { foo } from "module.js";
             *
             * // module.js
             * export const foo = "bar";
             *
             * If `foo` in module.js gets assigned to `foo_0`, then the `foo`
             * in main.js should also be assigned to `foo_0`.
             */
            const importDecl = getImportDeclaration(exportInfo);
            if (
               name &&
               importDecl &&
               exportInfo.type != "aggregatedNamespace" &&
               exportInfo.type != "declaredDefaultExpression"
            ) {
               const source = importDecl.node.source.value;
               const resolved = module.dependencyMap.get(source);
               if (!resolved) {
                  throw new Error("todo: err");
               }
               const specifiers = importDecl.node.specifiers;
               const specifier = specifiers.find((x) => {
                  const local = x.local.name;
                  const binding = importDecl.scope.getBinding(local);
                  return !!binding?.referencePaths.find(
                     (x) => x.node === exportInfo.identifier
                  );
               });

               if (!specifier) {
                  throw new Error(`Specifier of '${name}' is not found.`);
               }

               if (specifier.type == "ImportSpecifier") {
                  idMap.set(name, {
                     to: resolved,
                     name: getStringOrIdValue(specifier.imported),
                  });
               } else if (specifier.type == "ImportDefaultSpecifier") {
                  idMap.set(name, {
                     to: resolved,
                     name: "default",
                  });
               } else {
                  idMap.set(name, {
                     to: resolved,
                     name: symbols.namespace,
                  });
               }
            }
         });

         // for external imports
         module.getImports().forEach((importInfo) => {
            const { type, source } = importInfo;
            if (isLocal(source)) return;
            let data = this._map.get(source);
            if (!data) {
               data = {
                  idMap: new Map(),
                  namespace: uidGenerator.generateBasedOnScope(
                     importInfo.path.scope,
                     createName(source)
                  ),
               };
               this._map.set(source, data);
            }

            const { idMap } = data;

            let name, id;
            if (type == "default") {
               name = "default";
               id = createDefaultName(source);
            } else if (type == "specifier") {
               name = getStringOrIdValue(importInfo.specifier.imported);
               id = name == "default" ? createDefaultName(module.source) : name;
            }

            if (name && id && !idMap.has(name)) {
               idMap.set(
                  name,
                  uidGenerator.generateBasedOnScope(importInfo.path.scope, id)
               );
            }
         });
      }

      console.log(this._map);
   }
}
