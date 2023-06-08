import { Toypack } from "../Toypack.js";

export default function (options: IDefinePluginOptions = {}) {
   return function (this: Toypack) {
      this.hooks.onTranspile((event) => {
         const replacementKeys = Object.keys(options);
         if (!replacementKeys.length) return;

         event.traverse({
            Identifier: ({ node }) => {
               if (replacementKeys.includes(node.name)) {
                  node.name = options[node.name].toString();
               }
            }
         });
      });

      return {
         remove: (key: string) => {
            delete options[key];
         },
         add: (find: string, replacement: string) => {
            options[find] = replacement;
         }
      };
   };
}

type IDefinePluginOptions = Record<string, string>;