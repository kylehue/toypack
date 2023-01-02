import Toypack from "@toypack/core/Toypack";
import { IAsset, CompiledAsset, ToypackLoader } from "@toypack/core/types";

export default class JSONLoader implements ToypackLoader {
   public name = "JSONLoader";
   public test = /\.json$/;

   public compile(asset: IAsset, bundler: Toypack) {
      if (typeof asset.content != "string") {
         let error = new Error(
            "JSON Compile Error: Asset content must be string."
         );
         throw error;
      }

      let chunk = bundler._createMagicString(asset.content);
      chunk.prepend("module.exports = ");

      let result: CompiledAsset = {
         content: chunk,
      };

      return result;
   }
}
