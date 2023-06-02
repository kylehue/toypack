import {
   ICompileData,
   ICompileRecursive,
   ICompileResult,
   ILoader,
   Toypack,
} from "../Toypack.js";

export class TemplateLoader implements ILoader {
   public name = "TemplateLoader";
   public test: RegExp = /\.css$/;

   constructor(public bundler: Toypack) {}

   compile(data: ICompileData) {
      const result: ICompileResult = {
         type: "result",
         content: "",
      };

      return result;
   }
}
