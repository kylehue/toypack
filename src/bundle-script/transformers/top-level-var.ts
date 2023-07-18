import { TraverseMap } from "../utils/TraverseMap";
import { getPatternIds } from "../../utils";
import { isBlockScoped } from "@babel/types";

/**
 * Transforms all `const`/`let` top-level declarations to `var`.
 */
export function transformToVars(traverseMap: TraverseMap) {
   traverseMap.setTraverseAll(() => ({
      VariableDeclaration: {
         exit(path): void {
            const { scope, node } = path;

            if (
               scope.block.type == "BlockStatement" ||
               isBlockScoped(scope.block)
            ) {
               return;
            }

            for (const declarator of node.declarations) {
               const { id } = declarator;
               if (
                  id.type != "ArrayPattern" &&
                  id.type != "ObjectPattern" &&
                  id.type != "Identifier"
               ) {
                  continue;
               }
               const parentScope = scope.parent;
               getPatternIds(id).forEach((id) => {
                  if (parentScope?.hasBinding(id.name)) {
                     scope.rename(id.name);
                  }
               });
            }

            if (node.kind != "var") {
               node.kind = "var";
            }
         },
      },
   }));
}
