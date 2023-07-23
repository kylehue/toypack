import { ScriptDependency } from "src/parse";
import { addReservedVars, generateUid } from "../utils";

/**
 * Transforms all `const`/`let` top-level declarations to `var`.
 */
export function transformToVars(scriptModules: ScriptDependency[]) {
   scriptModules.forEach((module) => {
      const bindings = module.programPath.scope.getAllBindings();
      Object.values(bindings).forEach((binding) => {
         const path = binding.path.parentPath;
         if (!path?.isVariableDeclaration()) return;
         const { scope, node } = path;
         const ids = Object.values(path.getBindingIdentifiers());

         // rename ids if there's a conflict in the parent scope
         ids.forEach((id) => {
            const otherBinding = scope.parent?.getBinding(id.name);
            const hasConflict = !!otherBinding;
            const isSameScope = otherBinding?.scope === scope.parent;
            // only rename if the conflicted var is not in the same scope
            if (hasConflict && !isSameScope) {
               scope.rename(id.name, generateUid(id.name));
               addReservedVars(id.name);
            }
         });

         if (node.kind != "var") {
            node.kind = "var";
         }

         const reservedVars = Object.keys(scope.getAllBindings());
         addReservedVars(reservedVars);
      });
   });
}
