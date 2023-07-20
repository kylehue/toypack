import { Binding, Scope } from "@babel/traverse";
import { isBlockScoped } from "@babel/types";
import { TraverseMap } from "../utils/TraverseMap";
import { generateUid } from "../utils";
import runtime from "../runtime";

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
   const takenVars = new Set<string>();

   traverseMap.setTraverseAll((source) => ({
      Program(path) {
         const currentScope = path.scope;
         for (const binding of Object.values(
            getAllTopLevelBindings(currentScope)
         )) {
            const identifier = binding.identifier;
            const { name } = identifier;

            // TODO: should we really skip bindings that are in import declarations?
            if (
               currentScope
                  .getBinding(name)
                  ?.path.find((x) => x.isImportDeclaration())
            ) {
               continue;
            }

            if (takenVars.has(name) || name in runtime) {
               currentScope.rename(name, generateUid(name));
            }

            takenVars.add(identifier.name);
         }

         currentScope.crawl();
      },
   }));
}
