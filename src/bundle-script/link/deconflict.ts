import { ScriptDependency } from "src/parse";
import { UidGenerator } from "./UidGenerator";

/**
 * Deconflicts all of the top-level variables in script modules.
 */
export function deconflict(module: ScriptDependency) {
   const { scope } = module.programPath;

   const bindings = scope.getAllBindings();
   for (const binding of Object.values(bindings)) {
      const identifier = binding.identifier;
      let { name } = identifier;

      const newName = UidGenerator.generateBasedOnScope(
         binding.path.scope,
         name
      );
      scope.rename(name, newName);
      identifier.name = newName;
   }

   const reservedVars = Object.keys(bindings);
   UidGenerator.addReservedVars(reservedVars);
}
