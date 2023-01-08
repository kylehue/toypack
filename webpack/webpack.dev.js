const { merge } = require("webpack-merge");
const common = require("./webpack.common.js");

module.exports = merge(common, {
   mode: "development",
   devtool: "inline-cheap-source-map",
   watch: true,
   output: {
      filename: "[name].js",
      clean: true,
   },
});
