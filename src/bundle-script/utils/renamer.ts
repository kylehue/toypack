import { Binding } from "@babel/traverse";
import { ModuleTransformer } from "../../utils/module-transformer";
import { Identifier, StringLiteral } from "@babel/types";

function getStringOrIdValue(exported: StringLiteral | Identifier) {
   return exported.type == "Identifier" ? exported.name : exported.value;
}

export function renameBinding(
   binding: Binding,
   newName: string,
   moduleTransformer: ModuleTransformer
) {
   const refs = [
      ...binding.referencePaths,
      ...binding.constantViolations,
      binding.path,
   ];

   for (const ref of refs) {
      const ids = Object.values(ref.getOuterBindingIdentifierPaths());
      for (const id of ids) {
         if (id.node.name !== binding.identifier.name) continue;
         let replacer;
         if (id.parentPath.isObjectProperty() && id.parentPath.node.shorthand) {
            replacer = `${id.node.name}: ${newName}`;
         } else if (
            (id.parentPath.isImportSpecifier() &&
               id.parentPath.node.local.name ===
                  getStringOrIdValue(id.parentPath.node.imported)) ||
            (id.parentPath.isExportSpecifier() &&
               id.parentPath.node.local.name ===
                  getStringOrIdValue(id.parentPath.node.exported))
         ) {
            replacer = `${id.node.name} as ${newName}`;
         } else {
            replacer = newName;
         }
         moduleTransformer.update(id.node.start!, id.node.end!, replacer);
      }
   }
}
