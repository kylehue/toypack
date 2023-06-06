import path from "path-browserify";
import { PartialDeep, RequiredDeep } from "type-fest";
import { Asset } from "./asset.js";
import { bundle } from "./bundle.js";
import {
   appExtensions,
   resourceExtensions,
   styleExtensions,
} from "./extensions.js";
import { getDependencyGraph, IDependency, IModuleOptions } from "./graph.js";
import { Hooks } from "./Hooks.js";
import { JSONLoader } from "./loaders/JSONLoader.js";
import { SassLoader } from "./loaders/SassLoader.js";
import { defaultOptions, IOptions } from "./options.js";
import { resolve, IResolveOptions } from "./resolve.js";
import { RawSourceMap } from "source-map-js";
import { mergeDeep } from "./utils.js";

export interface ICompileData {
   source: string;
   content: string | Blob;
   options: IModuleOptions;
}

export interface ICompileResult {
   type: "result";
   content: string;
   map?: RawSourceMap;
}

export interface ICompileRecursive {
   type: "recurse";
   use: Record<string, ICompileData[]>;
}

export interface ILoader {
   name: string;
   test: RegExp;
   compile: (data: ICompileData) => ICompileResult | ICompileRecursive;
}

export interface IPlugin {
   name: string;
   apply: (bundler: Toypack) => void;
}

export class Toypack {
   public options: IOptions;
   public assets: Map<string, Asset>;
   public loaders: ILoader[] = [];
   private iframe: HTMLIFrameElement | null = null;
   public extensions = {
      resource: [...resourceExtensions],
      style: [...styleExtensions],
      script: [...appExtensions],
   };
   public hooks = new Hooks();
   constructor(options?: PartialDeep<IOptions>) {
      this.options = mergeDeep(JSON.parse(JSON.stringify(defaultOptions)), options);

      console.log(defaultOptions, this.options, options);
      

      this.assets = new Map();
      this.useLoader(new SassLoader(this));
      this.useLoader(new JSONLoader(this));

      if (this.options.logLevel == "error") {
         this.hooks.onError((error) => {
            console.error(error.reason);
         });
      }
   }

   public usePlugin(plugin: IPlugin) {
      plugin.apply(this);
   }

   public useLoader(loader: ILoader) {
      this.loaders.push(loader);
   }

   public resolve(relativeSource: string, options?: Partial<IResolveOptions>) {
      return resolve(this, relativeSource, options);
   }

   public setIFrame(iframe: HTMLIFrameElement) {
      this.iframe = iframe;
   }

   public addOrUpdateAsset(source: string, content: string | Blob) {
      source = path.join("/", source);
      const asset = new Asset(this, source, content);
      this.assets.set(source, asset);
      return asset;
   }

   public async getProductionOutput() {}

   public async run() {
      const graph = getDependencyGraph(this);
      console.log("Graph:", graph);
      const result = await bundle(this, graph);
      console.log("Bundle:", result);

      if (this.iframe) {
         this.iframe.srcdoc = `<!DOCTYPE html>
<html lang="en">
   <head>
      <meta charset="UTF-8" />
      <meta http-equiv="X-UA-Compatible" content="IE=edge" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Example</title>
      <style type="text/css">${result.style}</style>
   </head>
   <body>
      <script>${result.script}</script>
   </body>
</html>
`;
      }
   }
}

export default Toypack;

/* Other exports */
export * as Babel from "@babel/standalone";
export * as Utilities from "./utils.js";
export { Asset };
export { CodeComposer } from "./CodeComposer.js";
export type { IOptions };
export type { RawSourceMap };
export type {
   IChunk,
   IDependency,
   IDependencyMap,
   IDependencyMapSource,
   IModuleOptions,
   IResourceDependency,
   IScriptDependency,
   IStyleDependency,
} from "./graph.js";
