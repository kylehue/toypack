const { merge } = require("webpack-merge");
const common = require("./webpack.common.js");
const TerserPlugin = require("terser-webpack-plugin");

module.exports = [
   merge(common, {
      mode: "production",
      output: {
         filename: "[name].min.js",
      },
      optimization: {
         usedExports: true,
         minimize: true,
         minimizer: [
            new TerserPlugin({
               parallel: true,
               extractComments: false,
            }),
         ],
      },
   }),
   merge(common, {
      mode: "development",
      devtool: "source-map",
      output: {
         filename: "[name].js",
      },
   }),
];
