import type { ScriptModule, Toypack } from "src/types";
import { renameBinding } from "../utils/renamer";

/**
 * Deconflicts all of the top-level variables in script modules.
 */
export function deconflict(this: Toypack, module: ScriptModule) {
   const { scope } = module.programPath;
   const bindings = scope.getAllBindings();

   const declaredExports = new Set<string>();
   module.getExports(["declared"]).forEach((exportInfo) => {
      const ids = exportInfo.declaration.getOuterBindingIdentifiers();
      Object.values(ids).forEach((id) => declaredExports.add(id.name));
   });

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

      /**
       * We can skip the exports because they will be renamed anyway
       * when we bind the modules.
       */
      if (declaredExports.has(name)) {
         continue;
      }

      if (!this._uidGenerator.isConflicted(name)) {
         varsToReserve.add(name);
         continue;
      }

      const newName = this._uidGenerator.generateBasedOnScope(
         binding.path.scope,
         name,
         binding
      );

      renameBinding(module, binding, newName);
   }

   this._uidGenerator.addReservedVars(...varsToReserve);
}
