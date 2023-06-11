import { ILoaderResult, ILoader, Toypack } from "../Toypack.js";

export default function (): ILoader {
   return function (this: Toypack) {
      this.addExtension("script", ".ext");
      return {
         name: "ExtLoader",
         test: /\.ext$/,
         compile: async (data) => {
            let contentToCompile;
            if (typeof data.content != "string") {
               contentToCompile = await data.content.text();
            } else {
               contentToCompile = data.content;
            }

            const result: ILoaderResult = {
               mainLang: "js",
               contents: {
                  js: [
                     {
                        content: "/* bing bong */\n\n" + contentToCompile,
                     },
                  ],
               },
            };

            return result;
         },
      };
   };
}