import type { ScriptModule, Toypack } from "src/types";
import { renameBinding } from "../utils/renamer";

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

      if (!this._uidGenerator.isConflicted(name)) {
         continue;
      }

      /**
       * We can skip the exports because they will be renamed anyway
       * when we bind the modules.
       */
      if (declaredExports.has(name)) {
         continue;
      }

      /**
       * We can also skip bindings that are in import declaration because
       * they will be removed anyway.
       */
      if (binding.path.find((x) => x.isImportDeclaration())) {
         continue;
      }

      const newName = this._uidGenerator.generateBasedOnScope(
         binding.path.scope,
         name,
         binding
      );

      renameBinding(module, binding, newName);
   }

   this._uidGenerator.addReservedVars(...Object.keys(bindings));
}
