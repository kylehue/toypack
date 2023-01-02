const path = require("path");
const webpack = require("webpack");
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");
const TSCAlias = require("tsc-alias").replaceTscAliasPaths;
const glob = require("glob");

function resolve(dir) {
   return path.resolve(__dirname, dir);
}

const deps = glob
   .sync("{./loaders/*.ts,./plugins/*.ts}", {
      cwd: resolve("../src"),
      ignore: [
         "./loaders/index.ts",
         "./plugins/index.ts",
         "./loaders/LoaderTemplate.ts",
      ],
   })
   .reduce((acc, current) => {
      let parsedPath = path.parse(current);
      let name = parsedPath.name;
      let outdir = path.join(parsedPath.dir, name);
      acc[/* outdir */ name] = resolve("../src/" + current);
      return acc;
   }, {});

module.exports = {
   entry: {
      ...deps,
      Toypack: resolve("../src/index.ts"),
   },
   output: {
      filename: "[name].js",
      path: resolve("../lib"),
      clean: true,
      library: {
         name: "[name]",
         type: "umd",
         export: "default",
      },
   },
   module: {
      rules: [
         {
            test: /\.ts$/,
            use: "ts-loader",
            exclude: /node_modules/,
            sideEffects: false,
         },
         {
            test: /src\/index\.ts/,
            sideEffects: true,
         },
      ],
   },
   resolve: {
      alias: {
         "@toypack": resolve("../src/"),
      },
      fallback: {
         fs: false,
      },
      extensions: [".ts", ".js", ".json"],
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
