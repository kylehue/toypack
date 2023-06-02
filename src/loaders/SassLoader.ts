import {
   ICompileData,
   ICompileRecursive,
   ICompileResult,
   ILoader,
   Toypack,
} from "../Toypack.js";

export class SassLoader implements ILoader {
   public name = "SassLoader";
   public test: RegExp = /\.(sass|scss)$/;

   constructor(public bundler: Toypack) {}

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
