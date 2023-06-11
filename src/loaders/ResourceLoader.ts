import path from "path-browserify";
import { ILoaderResult, ILoader, Toypack } from "../Toypack.js";

// prettier-ignore
const extensions = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".bmp", ".tiff", ".tif", ".woff", ".woff2", ".ttf", ".eot", ".otf", ".webp", ".mp3", ".mp4", ".wav", ".mkv", ".m4v", ".mov", ".avi", ".flv", ".webm", ".flac", ".mka", ".m4a", ".aac", ".ogg", ".map"];

export default function (options: LoaderOptions): ILoader {
   return function (this: Toypack) {
      this.addExtension("style", extensions);

      return {
         name: "ResourceLoader",
         test: (source) => extensions.includes(path.extname(source)),
         async: false,
         compile: (data) => {
            const result: ILoaderResult = {
               mainLang: "",
               contents: {}
            };

            // const asset = this.getAsset(data.source);
            // let url = 
            // if (!asset) {

            // }

            // const moduleType = this.options.bundleOptions.moduleType;
            // const exportsSnippet =
            //    moduleType == "esm" ? "export default " : "module.exports = ";
            
            // result.content = "";

            return result;
         },
      };
   };
}

interface LoaderOptions {
   foo: number;
   bar: string;
}
