import { removeComments, addComment } from "@babel/types";
import { TraverseMap } from "./TraverseMap";

export function addSourceCommentMarks(traverseMap: TraverseMap) {
   traverseMap.setTraverseAll((source) => ({
      Program(path) {
         for (const node of path.node.body) {
            removeComments(node);
            if (node === path.node.body[0]) {
               addComment(
                  node,
                  "leading",
                  ` ${source.replace(/^\//, "")}`,
                  true
               );
            }
         }
      },
   }));
}
