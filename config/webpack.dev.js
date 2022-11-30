const { merge } = require("webpack-merge");
const path = require("path");

const common = require("./webpack.common.js");

module.exports = merge(common, {
	mode: "development",
	output: {
		chunkFilename: "[name].[chunkhash].js",
	},
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				use: [
					{
						loader: "ts-loader",
						options: {
							configFile: path.resolve(__dirname, "../tsconfig.json")
						},
					},
				],
				exclude: /node_modules/,
			},
		],
	},
	devtool: "eval-source-map",
});
