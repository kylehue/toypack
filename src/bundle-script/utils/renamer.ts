import { Binding } from "@babel/traverse";
import { ModuleDescriptor } from "./module-descriptor";
import { Identifier, StringLiteral } from "@babel/types";

function getStringOrIdValue(exported: StringLiteral | Identifier) {
   return exported.type == "Identifier" ? exported.name : exported.value;
}

export function renameBinding(
   binding: Binding,
   newName: string,
   moduleDescriptor: ModuleDescriptor
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
         if (
            moduleDescriptor
               .sliceGenerated(id.node.start!, id.node.end!)
               .trim() == newName
         ) {
            continue;
         }

         // console.log("renamed!");

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
         moduleDescriptor.update(id.node.start!, id.node.end!, replacer);
      }
   }
}
