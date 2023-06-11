const path = require("path");

module.exports = {
   entry: "./src/Toypack.ts",
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
      extensions: [".tsx", ".ts", ".js"],
   },
   output: {
      filename: "Toypack.js",
      path: path.resolve(__dirname, "browser"),
      library: {
         name: "Toypack",
         type: "umd",
         export: "default",
      },
      clean: true
   },
};
