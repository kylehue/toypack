import { BundleOptions, ToypackOptions } from "@toypack/core/types";

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

export const defaultOptions: ToypackOptions = {
   bundleOptions
};