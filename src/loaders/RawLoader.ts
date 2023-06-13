import { ILoaderResult, ILoader, Toypack } from "../Toypack.js";

export default function (): ILoader {
   return function (this: Toypack) {
      this.addExtension("script", ".txt");
      
      return {
         name: "RawLoader",
         test: (source, params) => params.raw === true || /\.txt$/.test(source),
         chaining: false,
         compile: async (data) => {
            let contentToCompile;
            if (typeof data.content != "string") {
               contentToCompile = await data.content.text();
            } else {
               contentToCompile = data.content;
            }
            
            const moduleType = this.config.bundle.moduleType;
            const exportsSnippet =
               moduleType == "esm" ? "export default " : "module.exports = ";
            
            const result: ILoaderResult = {
               mainLang: "js",
               contents: {
                  js: [
                     {
                        content:
                           exportsSnippet + `\`${contentToCompile}\`` + ";",
                     },
                  ],
               },
            };

            return result;
         },
      };
   };
}