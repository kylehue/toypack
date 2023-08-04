import { Statement, addComment, removeComments } from "@babel/types";
import type { ScriptModule } from "src/types";

/**
 * Removes top-level comments then adds source comment at the top
 * of each module.
 */
export function cleanComments(module: ScriptModule, statements?: Statement[]) {
   const body = statements || module.programPath.node.body;
   body.forEach((node) => {
      removeComments(node);
   });

   const comment = " " + module.source.replace(/^\//, "");
   addComment(body[0], "leading", comment, true);
}