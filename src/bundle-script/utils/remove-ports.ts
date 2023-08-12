import { ModuleDescriptor } from "./module-descriptor";

/**
 * Removes imports and exports.
 */
function removeModulePorts(moduleDescriptor: ModuleDescriptor) {
   const { module } = moduleDescriptor;
   const imports = module.getImports();
   for (const importInfo of imports) {
      if (importInfo.type == "dynamic") continue;
      moduleDescriptor.update(
         importInfo.path.node.start!,
         importInfo.path.node.end!,
         ""
      );
   }

   const exports = module.getExports();
   for (const exportInfo of exports) {
      const exportNode = exportInfo.path.node;
      if (exportInfo.type == "declared") {
         const decl = exportInfo.declaration;
         if (exportInfo.isExportDeclared) {
            let end: number;
            if (decl.isVariableDeclarator()) {
               const varDecl = decl.findParent((x) =>
                  x.isVariableDeclaration()
               )!;
               end = varDecl.node.start!;
            } else if (
               decl.isFunctionDeclaration() ||
               decl.isClassDeclaration()
            ) {
               end = decl.node.start!;
            } else {
               end = -1;
            }

            if (end != -1) {
               moduleDescriptor.update(exportNode.start!, end, "");
            }
         } else {
            moduleDescriptor.update(exportNode.start!, exportNode.end!, "");
         }
      } else if (exportInfo.type == "declaredDefault") {
         const decl = exportInfo.declaration;
         if (exportInfo.isExportDeclared) {
            moduleDescriptor.update(exportNode.start!, decl.node.start!, "");
         } else {
            moduleDescriptor.update(exportNode.start!, exportNode.end!, "");
         }
      } else if (exportInfo.type == "declaredDefaultExpression") {
         const decl = exportInfo.declaration;
         const end = decl.node.start!;
         moduleDescriptor.update(exportNode.start!, end, "");
      } else {
         moduleDescriptor.update(exportNode.start!, exportNode.end!, "");
      }
   }
}

export function removePorts(moduleDescriptors: ModuleDescriptor[]) {
   for (const moduleDescriptor of moduleDescriptors) {
      removeModulePorts(moduleDescriptor);
   }
}
