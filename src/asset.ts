import { Toypack } from "./Toypack.js";

export class Asset {
   constructor(
      public bundler: Toypack,
      public source: string,
      public content: string | Blob
   ) { }
}
