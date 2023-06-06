import { ICompileData, ICompileResult, ILoader, Toypack } from "../Toypack.js";

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

      if (typeof data.content != "string") {
         throw new Error(
            "JSONLoader only tolerates string contents. Received " +
               typeof data.content
         );
      }

      const format = this.bundler.options.bundleOptions.module;

      const exportsSnippet =
         format == "esm" ? "export default " : "module.exports = ";

      result.content = exportsSnippet + data.content + ";";

      return result;
   }
}
