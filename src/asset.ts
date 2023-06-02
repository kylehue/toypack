import { ILoader, Toypack } from "./Toypack.js";
import { loaderNotFound } from "./errors.js";
import { IModuleOptions } from "./graph.js";

export class Asset {
   constructor(
      public bundler: Toypack,
      public source: string,
      public content: string | ArrayBuffer
   ) {}

   compile(options: IModuleOptions) {
      const result: {
         source: string;
         content: string;
      }[] = [];

      const recursiveCompile = (
         source: string,
         content: string | ArrayBuffer
      ) => {
         const loader = this.bundler.loaders.find((l) => l.test.test(source));

         if (!loader) {
            this.bundler.hooks.trigger("onError", loaderNotFound(source));
            return;
         }

         const compilation = loader.compile({
            source,
            content,
            options,
         });

         if (compilation.type == "result") {
            result.push({
               source,
               content: compilation.content,
            });
         } else {
            for (let [lang, dataArr] of Object.entries(compilation.use)) {
               for (let data of dataArr) {
                  const chunkSource = `${this.source}.chunk-${result.length}.${lang}`;
                  if (result.some((v) => v.source == chunkSource)) {
                     continue;
                  }
                  recursiveCompile(chunkSource, data.content);
               }
            }
         }
      };

      recursiveCompile(this.source, this.content);

      return result;
   }
}