import { addComment, removeComments } from "@babel/types";
import { ScriptDependency } from "src/parse";

/**
 * Removes top-level comments then adds source comment at the top
 * of each module.
 */
export function cleanComments(module: ScriptDependency) {
   const path = module.programPath;
   path.node.body.forEach((node) => {
      removeComments(node);
   });

   const comment = " " + module.source.replace(/^\//, "");
   addComment(path.node.body[0], "leading", comment, true);
}
