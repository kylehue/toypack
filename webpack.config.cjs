const path = require("path");
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");

module.exports = {
   mode: "production",
   entry: "./src/Toypack.ts",
   resolve: {
      extensions: [".js", ".ts"],
      fallback: {
         path: require.resolve("path-browserify"),
         fs: false,
      },
      extensionAlias: {
         ".js": [".js", ".ts"],
      },
   },
   module: {
      rules: [
         {
            test: /\.ts$/,
            use: "ts-loader",
            exclude: /node_modules/,
         },
      ],
   },
   output: {
      filename: "Toypack.js",
      path: path.resolve(__dirname, "./browser"),
      library: {
         name: "Toypack",
         type: "umd",
      },
      clean: true,
   },
   devtool: "source-map",
   plugins: [new NodePolyfillPlugin()],
};
