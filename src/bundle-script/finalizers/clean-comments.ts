import { File, Statement } from "@babel/types";
import { ScriptDependency } from "src/graph";

export function cleanComments(
   files: { source?: string; ast: File }[]
) {
   for (const file of files) {
      file.ast.program.body.forEach((node, index) => {
         // remove comments
         node.leadingComments = undefined;
         node.trailingComments = undefined;

         // add module source mark
         if (file.source && index == 0) {
            node.leadingComments ??= [];
            node.leadingComments.unshift({
               type: "CommentLine",
               value: " " + file.source.replace(/^\//, ""),
            });
         }
      });
   }
}
