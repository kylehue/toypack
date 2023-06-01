import { Loader, Toypack } from "./Toypack.js";

export class Asset {
   public metadata = new Map();
   constructor(
      public bundler: Toypack,
      public source: string,
      public content: string | ArrayBuffer
   ) {
      
   }
}
