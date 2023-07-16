import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { TraverseMap } from "./TraverseMap";
import { getVarKind } from "./get-var-kind";

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
         if (path.find((a) => a.isFunctionDeclaration())) {
            return;
         }

         const { node, scope } = path;
         let { name } = node;

         // Skip globals
         const isGlobal = !scope.hasBinding(name);
         if (t.isMemberExpression(path.node) || isGlobal) {
            return;
         }

         const dupe = takenVars.find(
            (f) => f.value === name && f.scopeId !== scopeId
         );
         if (dupe) {
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
            taken.path.scope.registerDeclaration(path);
         }

         if (scope.hasBinding(name)) {
            takenVars.push({
               scopeId,
               value: name,
               path: path,
            });
         }
      },
   }));
}
