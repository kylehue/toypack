const path = require("path");
const webpack = require("webpack");
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin");
const libraryName = "Toypack";

module.exports = {
	entry: {
		index: path.resolve(__dirname, "../index.ts"),
	},
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				use: "ts-loader",
				exclude: /node_modules/,
			},
		],
	},
	resolve: {
		alias: {
			toypack: path.resolve(__dirname, "../src/"),
			fs: require.resolve("memfs"),
		},
		extensions: [".tsx", ".ts", ".js"],
	},
	output: {
		path: path.resolve(__dirname, "../dist"),
		filename: libraryName + ".js",
		clean: true,
		library: {
			name: libraryName,
			type: "umd",
			export: "default",
		},
		publicPath: "/",
	},
	plugins: [
		new CopyPlugin({
			patterns: [
				{
					from: path.resolve(__dirname, "../src/Toypack.d.ts"),
					to: path.resolve(__dirname, "../dist/")
				}
			]
		}),
		new NodePolyfillPlugin(),
		new webpack.ContextReplacementPlugin(
			/(.+)?@babel(\\|\/)standalone(.+)?/,
			path.resolve(__dirname, "../src"),
			{}
		),
		new webpack.ContextReplacementPlugin(
			/(.+)?@vue(\\|\/)compiler\-sfc(.+)?/,
			path.resolve(__dirname, "../src"),
			{}
		),
		new webpack.ContextReplacementPlugin(
			/(.+)?node\-sass(.+)?/,
			path.resolve(__dirname, "../src"),
			{}
		),
	],
};
