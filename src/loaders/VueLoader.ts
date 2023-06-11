import { ILoaderResult, ILoader, Toypack } from "../Toypack.js";

export default function (): ILoader {
   return function (this: Toypack) {
      this.addExtension("script", ".vue");

      return {
         name: "VueLoader",
         test: /\.vue$/,
         async: false,
         compile: (data) => {
            const result: ILoaderResult = {
               mainLang: "ts",
               contents: {
                  scss: [
                     {
                        content: "/* hello sass! #1 */",
                     },
                     {
                        content: "/* hello sass! #2 */",
                     },
                  ],
                  css: [
                     {
                        content: "/* hello css! */",
                     },
                  ],
                  ts: [
                     {
                        content: "let greet: string = 'hello js!';\nconsole.log(greet);",
                     },
                  ],
               },
            };

            return result;
         },
      };
   };
}