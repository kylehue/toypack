import { BundleOptions } from "@toypack/core/types";

export const bundleOptions: BundleOptions = {
   mode: "development",
   entry: "/",
   output: {
      path: "dist",
      filename: "bundle.js",
      contentURL: true,
      name: "",
      sourceMap: true
   }
}