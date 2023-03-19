import Toypack from "@toypack/core/Toypack";
import { ToypackPlugin } from "@toypack/core/types";

export default class AutoImportJSXPragmaPlugin implements ToypackPlugin {
   apply(bundler: Toypack) {
      bundler.hooks.afterCompile((descriptor) => {
         if (/\.[jt]sx$/.test(descriptor.asset.source)) {
            descriptor.compilation.content?.prepend(
               '\nvar React = require("react");'
            );
         }
      });

      bundler.hooks.parse((descriptor) => {
         if (/\.[jt]sx$/.test(descriptor.asset.source)) {
            descriptor.asset.loaderData.parse?.dependencies.push({
               source: "react",
            });
         }
      });
   }
}
