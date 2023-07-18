import { ScriptDependency } from "src/graph";

export function cleanComments(scriptModules: ScriptDependency[]) {
   for (const script of scriptModules) {
      const ast = script.ast;
      ast.program.body.forEach((node, index) => {
         // remove comments
         node.leadingComments = undefined;
         node.trailingComments = undefined;

         // add module source mark
         if (index == 0) {
            node.leadingComments ??= [];
            node.leadingComments.unshift({
               type: "CommentLine",
               value: " " + script.source.replace(/^\//, ""),
            });
         }
      });
   }
}
