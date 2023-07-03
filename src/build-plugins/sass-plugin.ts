import { Loader, Plugin } from "../types.js";

export default function (): Plugin {
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
      ],
   };
}
