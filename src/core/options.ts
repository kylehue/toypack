import { BundleOptions, PostCSSOptions, ToypackOptions } from "@toypack/core/types";
import autoprefixer from "autoprefixer";

export const bundleOptions: BundleOptions = {
   mode: "development",
   entry: "/",
   output: {
      path: "dist",
      filename: "[name][ext]",
      name: "",
      sourceMap: true,
      asset: "external",
      assetFilename: "[name][ext]"
   }
}

export const postCSSOptions: PostCSSOptions = {
	plugins: [autoprefixer],
	options: {},
};

export const defaultOptions: ToypackOptions = {
   bundleOptions,
   postCSSOptions
};