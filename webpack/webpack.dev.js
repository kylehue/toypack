const { merge } = require("webpack-merge");
const HTMLWebpackPlugin = require("html-webpack-plugin");
const common = require("./webpack.common.js");
const path = require("path");
module.exports = merge(common, {
	mode: "development",
	devServer: {
		client: {
			logging: "error",
		},
		static: path.resolve(__dirname, "../lib/"),
		port: process.env.PORT || 8080,
		hot: true,
		liveReload: false,
	},
	devtool: "inline-cheap-source-map",
	plugins: [
		new HTMLWebpackPlugin({
			title: "test",
			template: path.resolve(__dirname, "../examples/index.html"),
		}),
	],
});
