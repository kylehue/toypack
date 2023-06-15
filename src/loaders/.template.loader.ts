import { ILoaderResult, ILoader, Toypack } from "../Toypack.js";

export default function (options: LoaderOptions): ILoader {
   return function (this: Toypack) {
      this.addExtension("style", ".css");

      return {
         name: "TemplateLoader",
         test: /\.css$/,
         compile: (data) => {
            const result: ILoaderResult = {
               contents: {
                  js: [
                     {
                        content: "",
                     },
                  ],
               },
            };

            return result;
         },
      };
   };
}

interface LoaderOptions {
   foo: number;
   bar: string;
}