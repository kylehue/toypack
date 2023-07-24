import { Binding, Scope } from "@babel/traverse";
import { isBlockScoped } from "@babel/types";
import runtime from "../runtime";
import { ScriptDependency } from "src/parse";
import { UidGenerator } from "../utils";

function getAllTopLevelBindings(scope: Scope) {
   const bindings = scope.getAllBindings();
   const filtered: Record<string, Binding> = {};
   for (const [name, binding] of Object.entries(bindings)) {
      if (isBlockScoped(binding.scope.block)) continue;
      filtered[name] = binding;
   }

   return filtered;
}

function isFromImport(binding: Binding, otherBinding?: Binding) {
   const isImported = !!otherBinding?.path.find((x) => x.isImportDeclaration());
   const isExported =
      !!binding.path.find((x) => x.isExportDeclaration()) ||
      !!binding.referencePaths.find(
         (x) => !!x.find((x) => x.isExportDeclaration())
      ) ||
      !!binding.referencePaths.find(
         (x) => !!x.find((x) => x.isExportSpecifier())
      );

   return isImported && isExported;
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

         const conflict = conflicts[name];
         const hasConflict = typeof conflict == "object";
         /**
          * We must make sure that we don't deconflict bindings that are
          * bound to an import declaration because their names will be
          * handled when we bind the imports (in bind-imports.ts).
          */
         const isImported = isFromImport(binding, conflict?.binding);
         if (!isImported && (hasConflict || name in runtime)) {
            const newName = UidGenerator.generate(name);
            scope.rename(name, newName);
         }

         conflicts[identifier.name] ??= { scope, binding };
      }

      const reservedVars = Object.keys(scope.getAllBindings());
      UidGenerator.addReservedVars(reservedVars);
   });
}
