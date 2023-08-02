import type { ScriptModule, Toypack } from "src/types";

export function getIdWithError(this: Toypack, source: string, name: string) {
   const uid = this._uidTracker.get(source, name);

   if (!uid) {
      throw new Error(
         `'${source}' does not have an assigned id for '${name}'.`
      );
   }

   return uid;
}

export function getNamespaceWithError(this: Toypack, source: string) {
   const namespace = this._uidTracker.getNamespaceFor(source);
   if (!namespace) {
      throw new Error(`'${source}' does not have an assigned namespace id.`);
   }

   return namespace;
}

export function resolveWithError(module: ScriptModule, source: string) {
   const resolved = module.dependencyMap.get(source);
   if (!resolved) {
      throw new Error(`Can't resolve '${source}' in '${module.source}'.`);
   }

   return resolved;
}