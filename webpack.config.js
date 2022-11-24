const path = require("path");
const webpack = require("webpack");
const TerserPlugin = require("terser-webpack-plugin");
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");
const libraryName = "Bundler";
module.exports = {
	entry: {
		index: path.resolve(__dirname, "./index.js"),
	},
	module: {
		rules: [
			{
				test: /\.js$/,
				include: path.resolve(__dirname, "./src"),
				exclude: /node_modules/,
				loader: "babel-loader",
				options: {
					presets: [
						[
							"@babel/preset-env",
							{
								targets: "defaults",
							},
						],
					],
				},
			},
			{
				test: /\.(scss)$/,
				use: ["style-loader", "css-loader", "sass-loader"],
			},
			{
				test: /\.(png|jpg|gif|woff2)$/i,
				type: "asset/inline",
			},
		],
	},
	output: {
		path: path.resolve(__dirname, "./dist"),
		filename: libraryName + ".[contenthash].js",
		clean: true,
		library: {
			name: libraryName,
			type: "umd",
			export: "default",
		},
		publicPath: "/",
	},
	devtool:
		process.env.NODE_ENV == "development" ? "eval-source-map" : undefined,
	plugins: [
		new NodePolyfillPlugin(),
		new webpack.ContextReplacementPlugin(
			/(.+)?@babel(\\|\/)standalone(.+)?/,
			path.resolve(__dirname, "./src"),
			{}
		),
	],
	optimization:
		process.env.NODE_ENV == "production"
			? {
					minimize: true,
					minimizer: [
						new TerserPlugin({
							test: /\.js(\?.*)?$/i,
						}),
					],
			  }
			: undefined,
};
