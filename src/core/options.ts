import {
	BundleOptions,
	ToypackOptions,
} from "@toypack/core/types";

export const bundleOptions: BundleOptions = {
	mode: "development",
	entry: "/",
	output: {
		path: "dist",
		filename: "[name][ext]",
		name: "",
		sourceMap: "inline-cheap-sources",
		resourceType: "external",
		assetFilename: "[name][ext]",
	},
	resolve: {
		extensions: [".js", ".json"],
	},
	plugins: [],
	logs: true,
};

export const defaultOptions: ToypackOptions = {
	bundleOptions,
	packageProvider: "esm.sh",
};
