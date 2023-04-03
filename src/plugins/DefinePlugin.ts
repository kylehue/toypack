import Toypack from "@toypack/core/Toypack";
import { ToypackPlugin } from "@toypack/core/types";

export default class DefinePlugin implements ToypackPlugin {
   constructor(public options?: Record<string, string>) {}

   apply(bundler: Toypack) {
      bundler.hooks.parse((descriptor) => {
         if (typeof this.options != "object" || !this.options) {
            return;
         }

         let replacementKeys = Object.keys(this.options);

         if (!replacementKeys.length) return;

         let asset = descriptor.asset;
         let metadata = asset.loaderData.parse?.metadata;

         if (/\.([jt]sx?|[cm]js)$/.test(asset.source)) {
            if (metadata.AST) {
               bundler._getASTImports(metadata.AST, {
                  traverse: {
                     Identifier: (path) => {
                        let node = path.node;
                        if (replacementKeys.includes(node.name)) {
                           node.name = this.options![node.name].toString();
                        }
                     },
                  },
               });
            }
         }
      });
   }
}
