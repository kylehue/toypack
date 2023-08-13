import { ModuleTransformer } from "./module-transformer";

/**
 * Removes imports and exports.
 */
function removeModulePorts(moduleTransformer: ModuleTransformer) {
   const { module } = moduleTransformer;
   const imports = module.getImports();
   const visitedImports = new Set();
   for (const importInfo of imports) {
      if (importInfo.type == "dynamic") continue;
      if (visitedImports.has(importInfo.path)) continue;
      visitedImports.add(importInfo.path);
      let startIndex = importInfo.path.node.start!;
      let endIndex = importInfo.path.node.end!;

      moduleTransformer.update(startIndex, endIndex, "");
      // moduleTransformer.insertAt(importInfo.path.node.start!, "/* ");
      // moduleTransformer.insertAt(importInfo.path.node.end!, " */");
   }

   const exports = module.getExports();
   const visitedExports = new Set();
   for (const exportInfo of exports) {
      if (visitedExports.has(exportInfo.path)) continue;
      visitedExports.add(exportInfo.path);
      const exportNode = exportInfo.path.node;
      let startIndex = exportNode.start!;
      let endIndex = exportNode.end!;
      if (exportInfo.type == "declared" && exportInfo.isExportDeclared) {
         const decl = exportInfo.declaration;
         if (decl.isVariableDeclarator()) {
            const varDecl = decl.findParent((x) => x.isVariableDeclaration())!;
            endIndex = varDecl.node.start!;
         } else if (decl.isFunctionDeclaration() || decl.isClassDeclaration()) {
            endIndex = decl.node.start!;
         }
      } else if (
         exportInfo.type == "declaredDefault" &&
         exportInfo.isExportDeclared
      ) {
         const decl = exportInfo.declaration;
         endIndex = decl.node.start!;
      } else if (exportInfo.type == "declaredDefaultExpression") {
         const decl = exportInfo.declaration;
         endIndex = decl.node.start!;
      }

      moduleTransformer.update(startIndex, endIndex, "");
      // moduleTransformer.insertAt(startIndex, "/* ");
      // moduleTransformer.insertAt(endIndex, " */");
   }
}

function removeTopLevelComments(moduleTransformer: ModuleTransformer) {
   const { module } = moduleTransformer;
   module.ast.comments?.forEach((comment) => {
      moduleTransformer.update(comment.start!, comment.end!, "");
   });
}

export function finalizeModule(moduleTransformer: ModuleTransformer) {
   removeTopLevelComments(moduleTransformer);
   removeModulePorts(moduleTransformer);
}
