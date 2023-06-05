import { loaderNotFoundError } from "./errors.js";
import { IModuleOptions } from "./graph.js";
import { ILoader, Toypack } from "./Toypack.js";
import { btoa } from "./utils.js";

export class Asset {
   constructor(
      public bundler: Toypack,
      public source: string,
      public content: string | Blob
   ) { }
}
