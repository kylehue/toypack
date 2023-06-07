import path from "path-browserify";
import { RawSourceMap } from "source-map-js";
import { PartialDeep } from "type-fest";
import { Asset } from "./asset.js";
import { bundle } from "./bundle.js";
import {
   appExtensions,
   resourceExtensions,
   styleExtensions,
} from "./extensions.js";
import { getDependencyGraph, IModuleOptions } from "./graph.js";
import { Hooks } from "./Hooks.js";
import { JSONLoader } from "./loaders/JSONLoader.js";
import { SassLoader } from "./loaders/SassLoader.js";
import { defaultOptions, IOptions } from "./options.js";
import { resolve, IResolveOptions } from "./resolve.js";
import { mergeDeep } from "./utils.js";
import { CodeComposer } from "./CodeComposer.js";

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
      this.options = mergeDeep(
         JSON.parse(JSON.stringify(defaultOptions)),
         options
      );

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

   public unsetIFrame() {
      this.iframe = null;
   }

   public addOrUpdateAsset(source: string, content: string | Blob) {
      source = path.join("/", source);
      const asset = new Asset(this, source, content);
      this.assets.set(source, asset);
      return asset;
   }

   public getAsset(source: string) {
      source = path.join("/", source);
      return this.assets.get(source) || null;
   }

   public async getProductionOutput() {}

   public async run() {
      const graph = getDependencyGraph(this);
      const result = await bundle(this, graph);

      if (this.iframe) {
         this.iframe.srcdoc = result.html.content;
      }

      return result;
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
