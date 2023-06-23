import { Loader, Plugin } from "../types.js";

const sassPlugin: Plugin = () => {
   const sassLoader: Loader = {
      test: /\.s[ac]ss$/,
      compile(dep) {
         return "body { background-color: alicia; }" + dep.content;
      },
   };

   return {
      name: "sass-plugin",
      loaders: [sassLoader],
      extensions: [
         ["style", ".sass"],
         ["style", ".scss"],
      ]
   };
};

export default sassPlugin;
