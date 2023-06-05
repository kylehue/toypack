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
      if (typeof data.content != "string") {
         throw new Error("SassLoader currently doesn't support non-string content.");
      }

      const result: ICompileResult = {
         type: "result",
         content: data.content
      };

      /* const result: ICompileRecursive = {
         type: "recurse",
         use: {
            json: [data],
         },
      }; */

      return result;
   }
}
