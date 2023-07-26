import traverse, { TraverseOptions } from "@babel/traverse";
import { Node } from "@babel/types";
import { mergeTraverseOptions } from "../../utils";

export class TraverseMap {
   private _asts: Map<
      string,
      {
         ast: Node;
         traversals: TraverseOptions[];
      }
   > = new Map();

   eachAst(callback: (ast: Node, source: string) => void) {
      this._asts.forEach(({ ast }, source) => {
         callback(ast, source);
      });
   }

   setAst(source: string, ast: Node) {
      this._asts.set(source, {
         ast,
         traversals: [],
      });
   }

   setTraverse(source: string, options: TraverseOptions) {
      const group = this._asts.get(source);
      if (!group) {
         throw new Error(`The ast of '${source}' doesn't exist.`);
      }

      group.traversals.push(options);
   }

   setTraverseAll(callback: (source: string) => TraverseOptions) {
      this._asts.forEach((group, source) => {
         group.traversals.push(callback(source));
      });
   }

   doTraverse(source: string) {
      const group = this._asts.get(source);
      if (!group) {
         throw new Error(`The ast of '${source}' doesn't exist.`);
      }

      if (!group.traversals.length) return;

      const traverseOptions = mergeTraverseOptions(group.traversals);
      
      traverse(group.ast, traverseOptions);
   }

   doTraverseAll() {
      this._asts.forEach((_, source) => {
         this.doTraverse(source);
      });
   }
}
