const path = require("path");
const webpack = require("webpack");
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");
const TSCAlias = require("tsc-alias").replaceTscAliasPaths;
const libraryName = "Toypack";
module.exports = {
	entry: {
		index: path.resolve(__dirname, "../index.ts"),
	},
	resolve: {
		alias: {
			fs: require.resolve("memfs"),
			"@toypack": path.resolve(__dirname, "../src/"),
		},
		extensions: [".ts", ".tsx", ".js", ".json"],
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
		{
			apply: (compiler) => {
				compiler.hooks.done.tap("TSCAlias", () => {
					TSCAlias({
						configFile: path.resolve(__dirname, "../tsconfig.json"),
					});
				});
			},
		},
		new NodePolyfillPlugin(),
		new webpack.ContextReplacementPlugin(
			/(.+)?(@babel(\\|\/)standalone|@vue(\\|\/)compiler\-sfc|node\-sass)(.+)?/
		),
	],
};
