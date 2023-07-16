import { Node, NodePath, TraverseOptions } from "@babel/traverse";

function groupTraverseOptions(array: TraverseOptions[]) {
   const groups: TraverseGroupedOptions = {};
   for (const opts of array) {
      let key: keyof TraverseOptions;
      for (key in opts) {
         let group = groups[key];
         group ??= groups[key] = [];
         group.push((opts as any)[key]);
      }
   }

   return groups;
}

function createTraverseOptionsFromGroup(groups: TraverseGroupedOptions) {
   const options: TraverseOptions = {};

   let key: keyof TraverseOptions;
   for (key in groups) {
      const group = groups[key];
      if (!group) continue;
      (options as any)[key] = (scope: any, node: any) => {
         for (const fn of group) {
            (fn as TraverseFunction<Node["type"]>)(scope, node);
         }
      };
   }

   return options as TraverseOptions;
}

export function mergeTraverseOptions(options: TraverseOptions[]) {
   return createTraverseOptionsFromGroup(groupTraverseOptions(options));
}

type TraverseFunction<T> = (
   path: NodePath<Extract<Node, { type: T }>>,
   node: Node
) => void;

type TraverseGroupedOptions = {
   [Type in keyof TraverseOptions]?: TraverseFunction<Type>[];
};