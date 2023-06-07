import { Toypack } from "./Toypack.js";

export class Asset {
   public contentURL?: string;
   constructor(
      public bundler: Toypack,
      public source: string,
      public content: string | Blob
   ) {
      if (typeof content !== "string") {
         this.contentURL = URL.createObjectURL(content);
      }
   }
}
