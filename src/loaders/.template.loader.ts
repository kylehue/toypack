import { ILoaderResult, ILoader, Toypack } from "../Toypack.js";

export default function (options: LoaderOptions): ILoader {
   return function (this: Toypack) {

      return {
         name: "TemplateLoader",
         test: /\.css$/,
         extensions: [["style", ".css"]],
         compile: (data) => {
            const result: ILoaderResult = {
               js: [
                  {
                     content: "",
                  },
               ],
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