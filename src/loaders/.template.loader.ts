import { ICompileResult, ILoader, Toypack } from "../Toypack.js";

export default function (options: LoaderOptions): ILoader {
   return function (this: Toypack) {
      this.addExtension("style", ".css");

      return {
         name: "TemplateLoader",
         test: /\.css$/,
         async: false,
         compile: (data) => {
            const result: ICompileResult = {
               type: "result",
               content: "",
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