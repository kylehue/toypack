import { Binding, Scope } from "@babel/traverse";
import { isBlockScoped } from "@babel/types";
import { TraverseMap } from "../utils/TraverseMap";

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
export function deconflict(traverseMap: TraverseMap) {
   const prevScopes = new Set<Scope>();
   const takenVars = new Set<string>();

   traverseMap.setTraverseAll((source) => ({
      Program(path) {
         const currentScope = path.scope;

         for (const binding of Object.values(
            getAllTopLevelBindings(currentScope)
         )) {
            const identifier = binding.identifier;

            if (takenVars.has(identifier.name)) {
               currentScope.rename(identifier.name);
            }
            takenVars.add(identifier.name);
         }

         // no idea what this does but it fixes the missing bindings
         currentScope.crawl();

         for (const prevScope of prevScopes) {
            // Append the current bindings to previous modules
            for (const binding of Object.values(
               getAllTopLevelBindings(currentScope)
            )) {
               if (prevScope.hasBinding(binding.identifier.name)) continue;
               prevScope.registerDeclaration(binding.path);
            }

            // Append the previous bindings to the current module
            for (const binding of Object.values(
               getAllTopLevelBindings(prevScope)
            )) {
               if (currentScope.hasBinding(binding.identifier.name)) continue;
               currentScope.registerDeclaration(binding.path);
            }
         }

         prevScopes.add(currentScope);
      },
   }));
}
