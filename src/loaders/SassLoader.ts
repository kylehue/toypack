import Toypack from "@toypack/core/Toypack";
import {
   IAsset,
   CompiledAsset,
   ToypackLoader,
   ParsedAsset,
} from "@toypack/core/types";
import Sass from "sass.js";
import postcssSASS from "postcss-sass";
import postcssSCSS from "postcss-scss";
import CSSLoader, { CSSLoaderOptions } from "./CSSLoader";
import { merge } from "lodash-es";
import { isURL } from "@toypack/utils";
import { dirname } from "path-browserify";
import { create as createAsset } from "@toypack/core/asset";
export default class SassLoader implements ToypackLoader {
   public name = "SassLoader";
   public test = /\.s[ac]ss$/;

   private _getCSSLoader(bundler: Toypack) {
      let CSSLoader: CSSLoader | null = null;
      for (let loader of bundler.loaders) {
         if (loader.name == "CSSLoader") {
            CSSLoader = loader as CSSLoader;
         }
      }

      return CSSLoader;
   }

   public parse(asset: IAsset, bundler: Toypack) {
      let result: ParsedAsset = {
         dependencies: [],
      };

      let CSSLoader: CSSLoader | null = this._getCSSLoader(bundler);
      if (!CSSLoader) {
         throw new Error(
            "Sass Parse Error: CSSLoader is needed to parse Sass files."
         );
      }

      // Modify CSSLoader options
      merge(CSSLoader.options, {
         postcssConfig: {
            options: {
               syntax: /\.sass$/.test(asset.source) ? postcssSASS : postcssSCSS,
            },
         },
      } as CSSLoaderOptions);

      // Parse
      CSSLoader.parse(asset, bundler, {
         checkImported(imported) {
            // Only include URL imports and let Sass compiler handle local imports
            if (isURL(imported)) {
               result.dependencies.push({
                  source: imported,
               });
            }
         },
      });

      return result;
   }

   public async compile(asset: IAsset, bundler: Toypack) {
      if (typeof asset.content != "string") {
         let error = new Error("Sass Compile Error: Content must be string.");
         throw error;
      }

      let CSSLoader: CSSLoader | null = this._getCSSLoader(bundler);
      if (!CSSLoader) {
         throw new Error(
            "Sass Parse Error: CSSLoader is needed to compile Sass files."
         );
      }

      let CSSCompilation: any = await new Promise((fulfill) => {
         Sass.importer(async (request, done) => {
            let requestedSource = await bundler.resolve(request.current, {
               baseDir: dirname(asset.source),
               extensions: [".sass", ".scss", ".less", ".css"],
            });

            let cached = bundler.assets.get(requestedSource);

            done({
               content: cached?.content,
            });
         });

         Sass.compile(
            asset.content,
            {
               indentedSyntax: /\.sass$/.test(asset.source),
            },
            (result) => {
               fulfill(result);
            }
         );
      });

      let JSCompilation: CompiledAsset;
      if (CSSLoader) {
         let CSSCompilationAsset = createAsset(bundler, asset.source, CSSCompilation.text);
         JSCompilation = CSSLoader.compile(CSSCompilationAsset, bundler);
      } else {
         let error = new Error(
            "Sass Compile Error: CSS compiler is required to compile Sass files."
         );
         throw error;
      }

      let result: CompiledAsset = JSCompilation;

      return result;
   }
}
