const { merge } = require("webpack-merge");
const common = require("./webpack.common.js");
const TerserPlugin = require("terser-webpack-plugin");
module.exports = merge(common, {
	mode: "production",
	optimization: {
		usedExports: true,
		minimize: true,
		minimizer: [new TerserPlugin()]
	},
});
