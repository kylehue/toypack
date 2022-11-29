const { merge } = require("webpack-merge");
const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");

const common = require("./webpack.common.js");

module.exports = merge(common, {
	mode: "production",
	output: {
		chunkFilename: "[name].js",
	},
	optimization: {
		minimize: true,
		minimizer: [
			new TerserPlugin({
				test: /\.ts(\?.*)?$/i,
			}),
		],
	},
});
