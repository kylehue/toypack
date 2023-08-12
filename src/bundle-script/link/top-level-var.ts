import { ModuleDescriptor } from "../utils/module-descriptor";

/**
 * Transforms all `const`/`let` top-level declarations to `var`.
 */
export function transformToVars(moduleDescriptor: ModuleDescriptor) {
   const { module } = moduleDescriptor;
   const bindings = Object.values(module.programPath.scope.getAllBindings());

   for (const binding of bindings) {
      const { parentPath } = binding.path;
      if (!parentPath?.isVariableDeclaration()) continue;
      const { node } = parentPath;
      if (node.kind == "var") continue;
      moduleDescriptor.update(
         node.start!,
         node.start! + node.kind.length,
         "var"
      );

      node.kind = "var";
   }
}
