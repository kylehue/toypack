import { Scope } from "@babel/traverse";
import runtime from "../runtime";
import { camelCase } from "lodash-es";
import { UidTracker } from "./UidTracker";

export namespace UidGenerator {
   let _idCountMap: Record<string, number> = {};
   let _reservedVars = new Set<string>();
   function generate(name = "temp") {
      name = camelCase(name);
      let generated = name;
      _idCountMap[generated] ??= 0;
      if (_idCountMap[generated] >= 0) {
         generated = name + "_" + _idCountMap[generated]++;
      }

      return generated;
   }

   export function isConflicted(name: string) {
      let namespaces = UidTracker.getAllNamespaces();
      let isNamespace = namespaces.includes(name);
      return _reservedVars.has(name) || name in runtime || isNamespace;
   }

   export function addReservedVars(...vars: string[]) {
      _reservedVars = new Set([..._reservedVars, ...vars]);
   }

   export function generateBasedOnScope(scope: Scope, name?: string) {
      let generated = generate(name);

      let isTaken = scope.hasBinding(generated) || isConflicted(generated);
      while (isTaken) {
         generated = generate(name);
         isTaken = scope.hasBinding(generated) || isConflicted(generated);
      }

      _reservedVars.add(generated);

      return generated;
   }
}
