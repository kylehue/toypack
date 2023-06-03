import { IPlugin, Toypack } from "../Toypack.js";

export class DefinePlugin implements IPlugin {
   public name = "DefinePlugin";

   constructor(public options: Record<string, string> = {}) {

   }

   apply(bundler: Toypack) {
      bundler.hooks.onTranspile((event) => {
         const replacementKeys = Object.keys(this.options);
         if (!replacementKeys.length) return;

         event.traverse({
            Identifier: ({ node }) => {
               if (replacementKeys.includes(node.name)) {
                  node.name = this.options[node.name].toString();
               }
            }
         });
      });
   }
}