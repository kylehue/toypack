import { Node, NodePath, TraverseOptions } from "@babel/traverse";

function noopStops(path: NodePath) {
   path.skip = () => {};
   path.stop = () => {};
}

function groupTraverseOptions(array: TraverseOptions[]) {
   const groups: TraverseGroupedOptions = {};
   for (const opts of array) {
      let key: keyof TraverseOptions;
      for (key in opts) {
         let group = groups[key];
         group ??= (groups as any)[key] = [];
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
      (options as any)[key] = {
         enter(path: any, state: any) {
            noopStops(path);
            for (const fn of group) {
               if (typeof fn == "function") {
                  fn.call(this, path, state);
               } else {
                  fn.enter?.call(this, path, state);
               }
            }
         },
         exit(path: any, state: any) {
            noopStops(path);
            for (const fn of group) {
               if (typeof fn == "function") {
                  fn.call(this, path, state);
               } else {
                  fn.exit?.call(this, path, state);
               }
            }
         },
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

type TraverseConfig<T> = {
   enter: TraverseFunction<T>;
   exit: TraverseFunction<T>;
};

type TraverseGroupedOptions = {
   [Type in keyof TraverseOptions]?:
      | TraverseFunction<Type>[]
      | TraverseConfig<Type>[];
};
