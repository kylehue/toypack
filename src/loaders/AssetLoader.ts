import Toypack from "@toypack/core/Toypack";
import { Asset, CompiledAsset, ToypackLoader } from "@toypack/core/types";
import { formatPath, isLocal } from "@toypack/utils";
import { relative, dirname, join } from "path-browserify";

export default class AssetLoader implements ToypackLoader {
   public name = "AssetLoader";
   public test =
      /\.(png|jpe?g|gif|svg|bmp|tiff?|woff|woff2|ttf|eot|otf|webp|mp[34]|wav|mkv|wmv|m4v|mov|avi|flv|webm|flac|mka|m4a|aac|ogg|map)(\?.*)?$/;

   public compile(asset: Asset, bundler: Toypack) {
      let target = asset.contentURL;

      if (
         bundler.options.bundleOptions?.mode == "production" &&
         bundler.options.bundleOptions?.output?.resourceType == "external" &&
         !asset.isExternal
      ) {
         let dir = dirname(bundler.outputSource);

         let assetOutputFilename = formatPath(
            asset.source,
            bundler.options.bundleOptions?.output?.assetFilename || ""
         );

         target = relative(dir, assetOutputFilename);

         if (!isLocal(target)) {
            target = join("/", target);
         }
      }

      if (target) {
         target = `"${target}"`;
      }

      let chunk = bundler._createMagicString(`module.exports = ${target};`);

      let result: CompiledAsset = {
         content: chunk,
      };

      return result;
   }
}
