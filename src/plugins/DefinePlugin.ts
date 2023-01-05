import Toypack from "@toypack/core/Toypack";
import { ToypackPlugin } from "@toypack/core/types";

export default class DefinePlugin implements ToypackPlugin {
   constructor(public options?: Object) {}

   apply(bundler: Toypack) {
      bundler.hooks.afterCompile((descriptor) => {
         if (this.options) {
            for (let [target, replacement] of Object.entries(this.options)) {
               descriptor.compilation.content.replaceAll(target, replacement.toString());
            }
         }
      });
   }
}