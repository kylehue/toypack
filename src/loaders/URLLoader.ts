import { ILoaderResult, ILoader, Toypack } from "../Toypack.js";

function getBtoa(content: string | ArrayBuffer) {
   if (typeof window !== "undefined" && typeof window.btoa === "function") {
      if (content instanceof ArrayBuffer) {
         return window.btoa(
            new Uint8Array(content).reduce(
               (data, byte) => data + String.fromCharCode(byte),
               ""
            )
         );
      }

      return window.btoa(unescape(encodeURIComponent(content)));
   } else if (typeof Buffer === "function") {
      if (content instanceof ArrayBuffer) {
         return Buffer.from(new Uint8Array(content)).toString("base64");
      }

      return Buffer.from(content, "utf-8").toString("base64");
   }
}

export default function (options: InlineLoaderOptions): ILoader {
   return function (this: Toypack) {
      return {
         name: "InlineLoader",
         test: options.test,
         compile: async (data) => {
            if (typeof data.content == "string") {
               throw new Error("InlineLoader only supports Blob contents.");
            }

            const base64 = getBtoa(await data.content.arrayBuffer());
            const url = `data:${data.content.type};base64,${base64}`;

            const result: ILoaderResult = {
               js: [
                  {
                     content: `export default "${url}";`,
                  },
               ],
            };

            return result;
         },
      };
   };
}

interface InlineLoaderOptions {
   test: RegExp;
}