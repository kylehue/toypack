import type { Toypack } from "src/types";
import { UidTracker } from "../link/UidTracker";

export function getIdWithError(
   uidTracker: UidTracker,
   source: string,
   name: string
) {
   const uid = uidTracker.get(source, name);

   if (!uid) {
      throw new Error(`'${source}' does not have an export named '${name}'.`);
   }

   return uid;
}

export function getNamespaceWithError(uidTracker: UidTracker, source: string) {
   const namespace = uidTracker.getNamespaceFor(source);
   if (!namespace) {
      throw new Error(`'${source}' does not have an assigned namespace id.`);
   }

   return namespace;
}
