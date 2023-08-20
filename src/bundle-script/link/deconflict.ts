import { ModuleTransformer } from "../../utils/module-transformer";
import { renameBinding } from "../utils/renamer";
import { UidTracker } from "./UidTracker";
import type { ScriptModule } from "src/types";

/**
 * Deconflicts all of the top-level variables in script modules.
 */
export function deconflict(
   uidTracker: UidTracker,
   moduleTransformer: ModuleTransformer<ScriptModule>
) {
   const uidGenerator = uidTracker.uidGenerator;
   const { module } = moduleTransformer;
   const { scope } = module.programPath;
   const bindings = scope.getAllBindings();

   const varsToReserve = new Set<string>();
   for (const binding of Object.values(bindings)) {
      const identifier = binding.identifier;
      let { name } = identifier;

      /**
       * We can skip bindings that are in import declaration because
       * they will be removed anyway.
       */
      if (binding.path.find((x) => x.isImportDeclaration())) {
         continue;
      }

      if (!uidGenerator.isConflicted(name)) {
         varsToReserve.add(name);
         continue;
      }

      const newName = uidGenerator.generateBasedOnScope(
         binding.path.scope,
         name,
         binding
      );

      renameBinding(binding, newName, moduleTransformer);
   }

   uidGenerator.addReservedVars(...varsToReserve);
}
