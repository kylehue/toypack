import {
   ICompileData,
   ICompileRecursive,
   ICompileResult,
   ILoader,
   Toypack,
} from "../Toypack.js";

export class SassLoader implements ILoader {
   public name = "SassLoader";
   public test = /\.(sass|scss)$/;

   constructor(public bundler: Toypack) {
      bundler.extensions.style.push(".scss", ".sass");
   }

   compile(data: ICompileData) {
      const result: ICompileRecursive = {
         type: "recurse",
         use: {
            css: [],
         },
      };

      result.use.css.push(data);

      return result;
   }
}
