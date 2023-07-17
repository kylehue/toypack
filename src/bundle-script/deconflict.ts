import { NodePath } from "@babel/traverse";
import { isMemberExpression } from "@babel/types";
import { TraverseMap } from "./TraverseMap";

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
         // Only deconflict top-level vars
         if (path.findParent((a) => a.isFunctionDeclaration())) {
            return;
         }

         const { node, scope } = path;
         let { name } = node;

         // Skip globals
         const isGlobal = !scope.hasBinding(name);
         if (isGlobal) return;

         // Skip member expressions
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
