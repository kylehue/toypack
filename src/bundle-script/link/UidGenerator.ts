import { Scope } from "@babel/traverse";
import runtime from "../runtime";
import { camelCase } from "lodash-es";
import { UidTracker } from "./UidTracker";

export namespace UidGenerator {
   let _idCountMap: Record<string, number> = {};
   let _reservedVars = new Map<string, Scope>();
   function generate(name = "temp") {
      name = camelCase(name);
      let generated = name;
      _idCountMap[generated] ??= 0;
      if (_idCountMap[generated] >= 0) {
         generated = name + "_" + _idCountMap[generated]++;
      }

      return generated;
   }

   export function generateBasedOnScope(scope: Scope, name?: string) {
      let namespaces = UidTracker.getAllNamespaces();
      let generated = generate(name);

      let isNamespace = namespaces.includes(generated);
      let isRuntime = generated in runtime;
      let isTaken = scope.hasBinding(generated) || _reservedVars.has(generated);
      while (isTaken || isRuntime || isNamespace) {
         generated = generate(name);
         isTaken = scope.hasBinding(generated) || _reservedVars.has(generated);
         isRuntime = generated in runtime;
         isNamespace = namespaces.includes(generated);
      }

      _reservedVars.set(generated, scope);

      return generated;
   }
}
