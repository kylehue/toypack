import Toypack from "@toypack/core/Toypack";
import {
   Asset,
   CompiledAsset,
   ToypackLoader,
   ParsedAsset,
} from "@toypack/core/types";
import Sass from "sass.js";
import postcssSASS from "postcss-sass";
import postcssSCSS from "postcss-scss";
import CSSLoader from "./CSSLoader";
import { cleanStr, isURL } from "@toypack/utils";
import { dirname } from "path-browserify";

let cssLoader: CSSLoader | null = null;
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

   public parse(asset: Asset, bundler: Toypack) {
      if (typeof asset.content != "string") {
         let error = new Error("Sass Parse Error: Content must be string.");
         throw error;
      }

      let result: ParsedAsset = {
         dependencies: []
      };

      // Prepare CSS loader
      if (!cssLoader) {
         cssLoader = this._getCSSLoader(bundler);
      }

      if (!cssLoader) {
         throw new Error(
            "Sass Parse Error: CSSLoader is needed to parse Sass files."
         );
      }

      // Parse
      let parsed = cssLoader.parse(asset, bundler, {
         postcssConfig: {
            options: {
               syntax: /\.sass$/.test(asset.source) ? postcssSASS : postcssSCSS,
            },
         },
      });

      // Only keep url deps
      for (let i = 0; i < parsed.dependencies.length; i++) {
         let dep = parsed.dependencies[i];

         if (!isURL(dep.source)) {
            parsed.dependencies.splice(i, 1);
         }
      }

      result.dependencies = parsed.dependencies;

      return result;
   }

   public async compile(asset: Asset, bundler: Toypack) {
      if (typeof asset.content != "string") {
         let error = new Error("Sass Compile Error: Content must be string.");
         throw error;
      }

      // Get CSS compilation
      let CSSCompilation: any = await new Promise((resolve) => {
         // Handle imports
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
         
         // Compile
         Sass.compile(
            asset.content,
            {
               indentedSyntax: /\.sass$/.test(asset.source),
            },
            (result) => {
               resolve(result);
            }
         );
      });

      let result: CompiledAsset = {
         content: bundler._createMagicString(""),
         use: {
            css: [
               {
                  content: CSSCompilation.text,
                  map: CSSCompilation.map,
               },
            ],
         },
      };

      return result;
   }
}
