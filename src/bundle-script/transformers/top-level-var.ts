import { generateUid } from "../utils";
import { TraverseMap } from "../utils/TraverseMap";
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

            const parentScope = scope.parent;
            const ids = Object.values(path.getBindingIdentifiers());
            ids.forEach((id) => {
               if (parentScope?.hasBinding(id.name)) {
                  scope.rename(id.name, generateUid(id.name));
               }
            });

            if (node.kind != "var") {
               node.kind = "var";
            }
         },
      },
   }));
}
