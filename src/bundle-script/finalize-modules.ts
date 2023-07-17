import { ScriptDependency } from "src/graph";
import { File } from "@babel/types";

export function addSourceMarks(ast: File, source: string) {
   ast.program.body.forEach((node, index) => {
      node.leadingComments = undefined;
      node.trailingComments = undefined;

      if (index == 0) {
         node.leadingComments ??= [];
         node.leadingComments.unshift({
            type: "CommentLine",
            value: " " + source.replace(/^\//, ""),
         });
      }
   });
}

function removeImportExport(ast: File) {
   ast.program.body = ast.program.body.filter(
      (node) =>
         node.type !== "ExportDefaultDeclaration" &&
         node.type !== "ExportAllDeclaration" &&
         node.type !== "ExportNamedDeclaration" &&
         node.type !== "ImportDeclaration"
   );
}

export function finalizeModules(scriptModules: ScriptDependency[]) {
   for (const script of scriptModules) {
      const ast = script.ast;
      removeImportExport(ast);
      addSourceMarks(ast, script.source);
   }
}
