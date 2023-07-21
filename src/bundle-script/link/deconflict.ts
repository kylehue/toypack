import { Binding, Scope } from "@babel/traverse";
import { isBlockScoped } from "@babel/types";
import runtime from "../runtime";
import { ScriptDependency } from "src/parse";
import { addReservedVars, generateUid } from "../utils";

function getAllTopLevelBindings(scope: Scope) {
   const bindings = scope.getAllBindings();
   const filtered: Record<string, Binding> = {};
   for (const [name, binding] of Object.entries(bindings)) {
      if (isBlockScoped(binding.scope.block)) continue;
      filtered[name] = binding;
   }

   return filtered;
}

/**
 * Deconflicts all of the top-level variables in script modules.
 */
export function deconflict(scriptModules: ScriptDependency[]) {
   const conflicts: Record<
      string,
      {
         scope: Scope;
         binding: Binding;
      }
   > = {};

   scriptModules.forEach((module) => {
      const { scope } = module.programPath;

      for (const binding of Object.values(getAllTopLevelBindings(scope))) {
         const identifier = binding.identifier;
         let { name } = identifier;

         const hasConflict = typeof conflicts[name] == "object";
         // TODO: should we really skip bindings that are imported?
         const isImported =
            conflicts[name]?.binding.path.find((x) =>
               x.isImportDeclaration()
            ) && binding.path.find((x) => x.isExportDeclaration());

         if (!isImported && (hasConflict || name in runtime)) {
            const newName = generateUid(name);
            scope.rename(name, newName);
            name = newName;
         }

         conflicts[name] ??= { scope, binding };
      }

      const reservedVars = Object.keys(scope.getAllBindings()).concat(
         Object.keys(conflicts)
      );
      addReservedVars(reservedVars);
   });
}
