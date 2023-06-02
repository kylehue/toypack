import {
   ICompileData,
   ICompileResult,
   ILoader,
   Toypack,
} from "../Toypack.js";

export class JSONLoader implements ILoader {
   public name = "JSONLoader";
   public test: RegExp = /\.json$/;

   constructor(public bundler: Toypack) {}

   compile(data: ICompileData) {
      const result: ICompileResult = {
         type: "result",
         content: "",
      };

      const format = this.bundler.options.bundleOptions.format;

      if (format == "esm") {
         result.content = "export default " + data.content;
      } else {
         result.content = "module.exports = " + data.content;
      }

      return result;
   }
}
