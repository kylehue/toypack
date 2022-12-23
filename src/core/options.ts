import { BundleOptions, PostCSSOptions, ToypackOptions } from "@toypack/core/types";

export const bundleOptions: BundleOptions = {
   mode: "development",
   entry: "/",
   output: {
      path: "dist",
      filename: "[name][ext]",
      name: "",
      sourceMap: "inline-cheap-sources",
      asset: "external",
      assetFilename: "[name][ext]"
   }
}

export const postCSSOptions: PostCSSOptions = {
	plugins: [],
	options: {},
};

export const defaultOptions: ToypackOptions = {
   bundleOptions,
   postCSSOptions,
   autoAddDependencies: false
};