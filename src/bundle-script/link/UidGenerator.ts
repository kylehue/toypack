import { Binding } from "@babel/traverse";
import runtime from "../runtime";
import { camelCase } from "lodash-es";

export namespace UidGenerator {
   let _idCountMap: Record<string, number> = {};
   let _reservedVars = new Set<string>();
   export function generate(name = "temp") {
      name = camelCase(name);
      _idCountMap[name] ??= 0;
      let generated = name;
      while (_reservedVars.has(generated) || generated in runtime) {
         generated = name + "_" + _idCountMap[name]++;
      }

      _reservedVars.add(generated);

      return generated;
   }

   export function generateBasedOnBinding(binding: Binding, name?: string) {
      let generated = generate(name);
      while (binding.path.scope.hasBinding(generated)) {
         generated = generate(name);
      }

      return generate(name);
   }

   export function addReservedVars(reservedVars: string | string[]) {
      if (!Array.isArray(reservedVars)) reservedVars = [reservedVars];
      _reservedVars = new Set([..._reservedVars, ...reservedVars]);
   }

   export function reset() {
      _idCountMap = {};
      _reservedVars = new Set();
   }
}
