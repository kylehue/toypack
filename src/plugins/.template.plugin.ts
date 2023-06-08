import { Toypack } from "../Toypack.js";

interface PluginOptions {
   foo: number;
   bar: string;
}

export default function (options: PluginOptions) {
   return function (this: Toypack) {
      
      
   };
}