import { ModuleTransformer } from "../../utils/module-transformer";
import type { ScriptModule } from "src/types";

/**
 * Transforms all `const`/`let` top-level declarations to `var`.
 */
export function transformToVars(
   moduleTransformer: ModuleTransformer<ScriptModule>
) {
   const { module } = moduleTransformer;
   const bindings = Object.values(module.programPath.scope.getAllBindings());

   for (const binding of bindings) {
      const { parentPath } = binding.path;
      if (!parentPath?.isVariableDeclaration()) continue;
      const { node } = parentPath;
      moduleTransformer.update(
         node.start!,
         node.start! + node.kind.length,
         "var"
      );
   }
}
