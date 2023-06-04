import {
   ICompileData,
   ICompileResult,
   ILoader,
   Toypack,
} from "../Toypack.js";

export class JSONLoader implements ILoader {
   public name = "JSONLoader";
   public test = /\.json$/;

   constructor(public bundler: Toypack) {
      bundler.extensions.script.push(".json");
   }

   compile(data: ICompileData) {
      const result: ICompileResult = {
         type: "result",
         content: "",
      };

      const format = this.bundler.options.bundleOptions.module;

      if (format == "esm") {
         result.content = "export default " + data.content;
      } else {
         result.content = "module.exports = " + data.content;
      }

      return result;
   }
}
