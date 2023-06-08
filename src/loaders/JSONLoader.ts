import { ICompileResult, ILoader, Toypack } from "../Toypack.js";

export default function (): ILoader {
   return function (this: Toypack) {
      this.addExtension("script", ".json");

      return {
         name: "JSONLoader",
         test: /\.json$/,
         async: true,
         compile: async (data) => {
            let contentToCompile;
            const result: ICompileResult = {
               type: "result",
               content: "",
            };

            if (typeof data.content != "string") {
               contentToCompile = await data.content.text();
            } else {
               contentToCompile = data.content;
            }

            const format = this.options.bundleOptions.module;

            const exportsSnippet =
               format == "esm" ? "export default " : "module.exports = ";

            result.content = exportsSnippet + data.content + ";";

            return result;
         },
      };
   };
}