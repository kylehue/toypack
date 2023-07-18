import { ScriptDependency } from "src/graph";

export function removeImportExportDeclarations(
   scriptModules: ScriptDependency[]
) {
   for (const script of scriptModules) {
      const ast = script.ast;
      ast.program.body = ast.program.body.filter(
         (node) =>
            node.type !== "ExportDefaultDeclaration" &&
            node.type !== "ExportAllDeclaration" &&
            node.type !== "ExportNamedDeclaration" &&
            node.type !== "ImportDeclaration"
      );
   }
}
