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

         const { node, scope, parent } = path;
         let { name } = node;

         // Skip globals and member expressions
         const isGlobal = !scope.hasBinding(name);
         if (t.isMemberExpression(parent) && isGlobal) {
            return;
         }

         const dupe = takenVars.find(
            (f) => f.value === name && f.scopeId !== scopeId
         );
         if (dupe) {
            // Rename
            name = scope.generateUid(name);
            scope.rename(node.name, name);
            /**
             * We must let the other scopes know that this identifier
             * name already exists to avoid id conflicts when generating
             * uids in other scopes. We can achieve this by binding the
             * identifier to that scope.
             */
            if (!dupe.path.scope.hasBinding(node.name)) {
               const varDecl = path.find((a) => a.isVariableDeclaration());
               const kind = getVarKind(varDecl);
               dupe.path.scope.registerBinding(kind, path);
            }
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
