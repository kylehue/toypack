const { merge } = require("webpack-merge");
const path = require("path");

const common = require("./webpack.common.js");

module.exports = merge(common, {
	mode: "development",
	output: {
		chunkFilename: "[name].[chunkhash].js"
	},
	devtool: "eval-source-map",
});
