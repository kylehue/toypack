import {
   Asset,
   ToypackLoader,
   ParsedAsset,
   CompiledAsset,
} from "@toypack/core/types";

import { parse as getAST, ParserOptions } from "@babel/parser";
import {
   transformFromAst,
   transform,
   registerPlugin,
   registerPreset,
   availablePlugins,
} from "@babel/standalone";
import Toypack from "@toypack/core/Toypack";
import { TraverseOptions, Node } from "@babel/traverse";
import { TransformOptions } from "@babel/core";
import { merge, cloneDeep } from "lodash-es";
import SourceMap from "@toypack/core/SourceMap";
import addModuleExportsPlugin from "babel-plugin-add-module-exports";

const defaultTransformOptions: TransformOptions = {
   sourceType: "module",
   compact: false,
   presets: ["typescript", "react", "env"],
   plugins: [
      addModuleExportsPlugin,
      availablePlugins["transform-typescript"],
   ],
   comments: false,
};

const defaultParseOptions: ParserOptions = {
   sourceType: "module",
   plugins: ["typescript", "jsx"],
};

const defaultOptions: BabelLoaderOptions = {
   transformOptions: defaultTransformOptions,
   parseOptions: defaultParseOptions,
   registerPlugins: [],
   registerPresets: [],
};

console.log(availablePlugins);


interface BabelLoaderOptions {
   /**
    * Babel transform options.
    */
   transformOptions?: TransformOptions;
   parseOptions?: ParserOptions;
   registerPlugins?: [string, object | (() => void)][];
   registerPresets?: [string, object | (() => void)][];
}

export interface ParseOptions {
   AST?: Node | Node[];
}

export default class BabelLoader implements ToypackLoader {
   public name = "BabelLoader";
   public test = /\.([jt]sx?)$/;

   constructor(public options?: BabelLoaderOptions) {
      this.options = merge(cloneDeep(defaultOptions), options);

      if (this.options?.registerPlugins?.length) {
         for (let plugin of this.options.registerPlugins) {
            registerPlugin(plugin[0], plugin[1]);
         }
      }

      if (this.options?.registerPresets?.length) {
         for (let preset of this.options.registerPresets) {
            registerPreset(preset[0], preset[1]);
         }
      }
   }

   public compile(asset: Asset, bundler: Toypack) {
      if (typeof asset.content != "string") {
         let error = new Error(
            "Babel Compile Error: Asset content must be string."
         );
         throw error;
      }

      let result: CompiledAsset = {} as CompiledAsset;

      if (!asset.isObscure) {
         const transformOptions = {
            ...this.options?.transformOptions,
            ...({
               sourceFileName: asset.source,
               filename: asset.source,
               sourceMaps:
                  bundler.options.bundleOptions?.mode == "development" &&
                  !!bundler.options.bundleOptions?.output?.sourceMap,
               envName: bundler.options.bundleOptions?.mode,
            } as TransformOptions),
         };

         let parseMetadata = asset.loaderData.parse?.metadata;

         // Transpile
         const transpiled: any = parseMetadata?.AST
            ? transformFromAst(parseMetadata.AST, undefined, transformOptions)
            : transform(asset.content, transformOptions);

         if (transpiled?.code) {
            let chunk = bundler._createMagicString(transpiled.code);

            result.content = chunk;

            if (transpiled.map) {
               result.map = new SourceMap(transpiled.map);
            }
         } else {
            throw new Error(
               `Babel Compile Error: Failed to compile ${asset.source}`
            );
         }
      }

      return result;
   }

   public parse(asset: Asset, bundler: Toypack, options?: ParseOptions) {
      if (typeof asset.content != "string") {
         let error = new Error(
            "Babel Parse Error: Asset content must be string."
         );
         throw error;
      }

      let result: ParsedAsset = {
         dependencies: [],
         metadata: {},
      };

      if (!asset.isObscure || asset.isExternal) {
         const AST = options?.AST
            ? options.AST
            : getAST(asset.content, {
                 ...this.options?.parseOptions,
                 sourceFilename: asset.source,
              });

         const isCoreModule = /^\/node_modules\//.test(asset.source);
         let traverseOptions: TraverseOptions = {};
         if (isCoreModule && /__esModule/g.test(asset.content)) {
            traverseOptions.Identifier = ({ node }) => {
               if (node.name == "__esModule") {
                  node.name = "__esModule_reserved";
               }
            };
         }

         // Extract dependencies
         const imports = bundler._getASTImports(AST, {
            traverse: traverseOptions,
         });

         for (let dep of imports) {
            let isAdded = result.dependencies.some((d) => d.source === dep.id);

            if (!isAdded) {
               result.dependencies.push({
                  source: dep.id,
               });
            }
         }

         result.metadata.AST = AST;
      }

      return result;
   }
}
