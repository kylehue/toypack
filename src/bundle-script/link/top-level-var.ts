import { ScriptDependency } from "src/parse";
import { UidGenerator } from "./UidGenerator";
import { getModulesMap } from "../utils/get-module-map";

/**
 * Transforms all `const`/`let` top-level declarations to `var`.
 */
export function transformToVars(module: ScriptDependency) {
   const bindings = Object.values(module.programPath.scope.getAllBindings());

   for (const binding of bindings) {
      const path = binding.path.parentPath;
      if (!path?.isVariableDeclaration()) continue;
      const { scope, node } = path;
      if (node.kind == "var") continue;

      const ids = Object.values(path.getBindingIdentifiers());

      // rename ids if there's a conflict in the parent scope
      ids.forEach((id) => {
         const otherBinding = scope.parent?.getBinding(id.name);
         const hasConflict = !!otherBinding;
         const isSameScope = otherBinding?.scope === scope.parent;
         // only rename if the conflicted var is not in the same scope
         if (hasConflict && !isSameScope) {
            scope.rename(
               id.name,
               UidGenerator.generateBasedOnScope(binding.path.scope, id.name)
            );
         }
      });

      node.kind = "var";
   }
}
