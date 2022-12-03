const path = require("path");
const webpack = require("webpack");
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");
const TSCAlias = require("tsc-alias").replaceTscAliasPaths;

function resolve(dir) {
   return path.resolve(__dirname, dir);
}

module.exports = {
	entry: resolve("../src/index.ts"),
	module: {
		rules: [
			{
				test: /\.ts$/,
				use: [
					{
						loader: "ts-loader",
						options: {
							configFile: resolve("../tsconfig.json"),
						},
					},
				],
				exclude: /node_modules/,
			},
		],
	},
	resolve: {
		alias: {
			fs: "memfs",
			"@toypack": resolve("../src/"),
		},
		extensions: [".ts", ".js", ".json"],
	},
	output: {
		path: resolve("../lib"),
		filename: "Toypack.umd.js",
		chunkFilename: "[name].[chunkhash].js",
		clean: true,
		library: {
			name: "Toypack",
			type: "umd",
			export: "default",
		},
	},
	plugins: [
		{
			apply: (compiler) => {
				compiler.hooks.done.tap("TSCAlias", () => {
					TSCAlias({
						configFile: resolve("../tsconfig.json"),
					});
				});
			},
		},
		new NodePolyfillPlugin(),
		new webpack.ContextReplacementPlugin(
			/(.+)?(@babel(\\|\/)standalone|@vue(\\|\/)compiler\-sfc)(.+)?/
		),
	],
};