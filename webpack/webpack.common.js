const path = require("path");
const webpack = require("webpack");
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");
const TSCAlias = require("tsc-alias").replaceTscAliasPaths;
const glob = require("glob");
function resolve(dir) {
	return path.resolve(__dirname, dir);
}

const LOADERS = glob
	.sync("./loaders/*/index.ts", {
		cwd: resolve("../src"),
	})
	.reduce((acc, current) => {
		let parsedPath = path.parse(current);
		let name = parsedPath.name;
		let outdir = path.join(parsedPath.dir, name);
		acc[outdir] = resolve("../src/" + current);
		return acc;
	}, {});

module.exports = {
	entry: {
		"core/Toypack": resolve("../src/index.ts"),
		...LOADERS,
	},
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
			"@toypack": resolve("../src/"),
		},
		extensions: [".ts", ".js", ".json"],
	},
	output: {
		path: resolve("../lib"),
		filename: "[name].js",
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
		// new webpack.ContextReplacementPlugin(
		// 	/(.+)?(@babel(\\|\/)standalone|@babel(\\|\/)parser|@vue(\\|\/)compiler\-sfc)(.+)?/
		// ),
	],
};
