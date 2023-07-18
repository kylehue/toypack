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
         let group: any = groups[key];
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
      if (!group?.length) continue;

      // filter enters and exits
      const enters: TraverseFunction<any>[] = [];
      const exits: TraverseFunction<any>[] = [];
      for (const fn of group) {
         if (typeof fn == "function") {
            enters.push(fn);
            continue;
         }
         
         if (typeof fn.enter == "function") {
            enters.push(fn.enter);
         }
         
         if (typeof fn.exit == "function") {
            exits.push(fn.exit);
         }
      }

      (options as any)[key] ??= {};

      if (enters.length) {
         (options as any)[key].enter = function (path: any, state: any) {
            noopStops(path);
            for (const fn of enters) {
               fn.call(this, path, state);
            }
         };
      }
      
      if (exits.length) {
         (options as any)[key].exit = function(path: any, state: any) {
            noopStops(path);
            for (const fn of exits) {
               fn.call(this, path, state);
            }
         }
      }
   }

   return options as TraverseOptions;
}

export function mergeTraverseOptions(options: TraverseOptions[]) {
   return createTraverseOptionsFromGroup(groupTraverseOptions(options));
}

type TraverseFunction<T = Node> = (
   path: NodePath<T extends Node ? Node : Extract<Node, { type: T }>>,
   node: Node
) => void;

type TraverseConfig<T> = {
   enter: TraverseFunction<T>;
   exit: TraverseFunction<T>;
};

type TraverseOption<T = Node> = TraverseFunction<T> | TraverseConfig<T>;

type TraverseGroupedOptions = {
   [T in keyof TraverseOptions]?:
      TraverseOption<T>[];
};
