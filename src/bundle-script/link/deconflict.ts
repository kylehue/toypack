import type { ScriptModule, Toypack } from "src/types";
import { renameId } from "../utils/renamer";

const done = new Set();

/**
 * Deconflicts all of the top-level variables in script modules.
 */
export function deconflict(this: Toypack, module: ScriptModule) {
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

      if (!this._uidGenerator.isConflicted(name)) {
         continue;
      }

      const newName = this._uidGenerator.generateBasedOnScope(
         binding.path.scope,
         name,
         binding
      );

      renameId(module, name, newName);

      // if (done.has(newName)) {
      //    console.log(`duplicated alert! ${newName} is done!`);
         
      // }
      // done.add(newName);

      // scope.rename(name, newName);
      // identifier.name = newName;
   }

   this._uidGenerator.addReservedVars(...Object.keys(bindings));
}
