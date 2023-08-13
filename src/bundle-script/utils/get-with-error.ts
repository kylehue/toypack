import { ERRORS } from "../../utils";
import { UidTracker } from "../link/UidTracker";
import type { ScriptModule, Toypack } from "src/types";

export function getIdWithError(
   this: Toypack,
   uidTracker: UidTracker,
   source: string,
   name: string
) {
   const uid = uidTracker.get(source, name) || "";

   if (!uid) {
      this._pushToDebugger(
         "error",
         ERRORS.any(`'${source}' does not have an export named '${name}'.`)
      );
   }

   return uid;
}

export function getNamespaceWithError(
   this: Toypack,
   uidTracker: UidTracker,
   source: string
) {
   const namespace = uidTracker.getNamespaceFor(source) || "";
   if (!namespace) {
      this._pushToDebugger(
         "error",
         ERRORS.any(`'${source}' does not have an assigned namespace id.`)
      );
   }

   return namespace;
}

export function getResolvedWithError(
   this: Toypack,
   module: ScriptModule,
   source: string
) {
   const resolved = module.dependencyMap.get(source) || "";
   if (!resolved) {
      this._pushToDebugger(
         "error",
         ERRORS.any(`Failed to resolve '${source}' in ${module.source}.`)
      );
   }

   return resolved;
}
