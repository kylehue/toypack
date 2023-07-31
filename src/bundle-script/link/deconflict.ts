import { ScriptDependency } from "src/parse";
import { UidGenerator } from "./UidGenerator";
import { UidTracker } from "./UidTracker";

/**
 * Deconflicts all of the top-level variables in script modules.
 */
export function deconflict(module: ScriptDependency) {
   const { scope } = module.programPath;
   const bindings = scope.getAllBindings();

   const declaredExports = new Set<string>();
   Object.values(module.exports.declared).forEach((exportInfo) => {
      const ids = exportInfo.declaration.getOuterBindingIdentifiers();
      Object.values(ids).forEach((id) => declaredExports.add(id.name));
   });

   for (const binding of Object.values(bindings)) {
      const identifier = binding.identifier;
      let { name } = identifier;
      
      /**
       * We can skip the exports because they will be renamed anyway
       * when we bind the modules
       */
      if (declaredExports.has(name)) {
         continue;
      }
      
      if (!UidGenerator.isConflicted(name)) {
         continue;
      }
      
      const newName = UidGenerator.generateBasedOnScope(
         binding.path.scope,
         name
      );
      
      scope.rename(name, newName);
      identifier.name = newName;
   }

   UidGenerator.addReservedVars(...Object.keys(bindings));
}
