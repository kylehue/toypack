import Toypack from "@toypack/core/Toypack";
import {
   Asset,
   CompiledAsset,
   ToypackLoader,
   ParsedAsset,
} from "@toypack/core/types";
import MagicString from "magic-string";

export default class LoaderTemplate implements ToypackLoader {
   public name = "LoaderTemplate";
   public test = /\.([jt]sx?)$/;

   public parse(asset: Asset, bundler: Toypack) {
      let result: ParsedAsset = {
         dependencies: [],
      };

      return result;
   }

   public compile(asset: Asset, bundler: Toypack) {
      let result: CompiledAsset = {
         content: {} as MagicString,
      };

      return result;
   }
}
