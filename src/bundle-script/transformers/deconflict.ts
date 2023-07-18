import { NodePath } from "@babel/traverse";
import { isBlockScoped, isMemberExpression } from "@babel/types";
import { TraverseMap } from "../utils/TraverseMap";

/**
 * Deconflicts all of the script modules in the dependency graph.
 */
export function deconflict(traverseMap: TraverseMap) {
   let takenVars: {
      scopeId: string;
      value: string;
      path: NodePath;
   }[] = [];

   traverseMap.setTraverseAll((scopeId) => ({
      Identifier(path) {
         const { node, scope } = path;
         
         // Only target top-level vars
         if (isBlockScoped(scope.block)) {
            return;
         }

         let { name } = node;

         const isGlobal = !scope.hasBinding(name);
         if (isGlobal) return;

         if (isMemberExpression(path.node)) return;

         const duplicate = takenVars.find(
            (f) => f.value === name && f.scopeId !== scopeId
         );
         if (duplicate) {
            // Rename
            name = scope.generateUid(name);
            scope.rename(node.name, name);
         }

         /**
          * We must let the other scopes know that this identifier
          * name already exists to avoid id conflicts when generating
          * uids in other scopes. We can achieve this by binding the
          * identifier to that scope.
          */
         for (const taken of takenVars) {
            if (taken.path.scope.hasBinding(node.name)) continue;
            if (taken.scopeId == scopeId) continue;
            taken.path.scope.registerDeclaration(path);
         }
         
         takenVars.push({
            scopeId,
            value: name,
            path: path,
         });
      },
   }));
}
