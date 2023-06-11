import { ILoaderResult, ILoader, Toypack } from "../Toypack.js";

export default function (): ILoader {
   return function (this: Toypack) {
      this.addExtension("style", ".sass");
      this.addExtension("style", ".scss");

      return {
         name: "SassLoader",
         test: /\.s[ac]ss$/,
         async: false,
         compile: (data) => {
            if (typeof data.content != "string") {
               throw new Error("soaeijfs")
            }

            const result: ILoaderResult = {
               mainLang: "js",
               contents: {
                  js: [
                     {
                        content: "/* compiled! */ " + data.content,
                     },
                  ],
               },
            };

            return result;
         },
      };
   };
}