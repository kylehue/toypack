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
import { getDependencyGraph, IChunk, IModuleOptions } from "./graph.js";
import { Hooks } from "./Hooks.js";
import JSONLoader from "./loaders/JSONLoader.js";
import { defaultOptions, IOptions } from "./options.js";
import { resolve, IResolveOptions } from "./resolve.js";
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

/**
 * Represents a recursive compile object, indicating that further
 * compilation is required.
 */
export interface ICompileRecursive {
   type: "recurse";
   /**
    * Specifies the usage of different formats for the asset.
    * The key represents the format, such as 'less', 'scss', 'pug', etc.
    * The value is an array of `ICompileData` objects representing
    * the data to be compiled by other loaders.
    */
   use: Record<string, ICompileData[]>;
}

interface ILoaderDataBase {
   /** The name of the loader. */
   name: string;
   /** Regular expression pattern used to match the asset source that the loader should be applied to. */
   test: RegExp;
}

interface ILoaderDataAsync extends ILoaderDataBase {
   async: true;
   /** Async function that handles the compilation of the matched files. */
   compile: (
      data: ICompileData
   ) => Promise<ICompileResult | ICompileRecursive>;
}

interface ILoaderDataSync extends ILoaderDataBase {
   async: false;
   /** Function that handles the compilation of the matched files. */
   compile: (data: ICompileData) => ICompileResult | ICompileRecursive;
}

type ILoaderData = ILoaderDataAsync | ILoaderDataSync;

export type ILoader = (this: Toypack) => ILoaderData;
export type IPlugin = (this: Toypack) => any;

export class Toypack {
   private iframe: HTMLIFrameElement | null = null;
   private extensions = {
      resource: [...resourceExtensions],
      style: [...styleExtensions],
      script: [...appExtensions],
   };
   protected loaders: ILoaderData[] = [];
   protected assets: Map<string, Asset>;
   protected cache = new Map<string, IChunk>();
   public options: IOptions;
   public hooks = new Hooks();
   constructor(options?: PartialDeep<IOptions>) {
      this.options = mergeDeep(
         JSON.parse(JSON.stringify(defaultOptions)),
         options
      );

      this.assets = new Map();
      this.useLoader(JSONLoader());
      // this.useLoader(new JSONLoader(this));

      if (this.options.logLevel == "error") {
         this.hooks.onError((error) => {
            console.error(error.reason);
         });
      }
   }

   protected getExtensions(type: keyof typeof this.extensions) {
      return this.extensions[type];
   }

   protected addExtension(type: keyof typeof this.extensions, ext: string) {
      this.getExtensions(type).push(ext);
   }

   protected hasExtension(type: keyof typeof this.extensions, source: string) {
      const extension = path.extname(source);
      return this.getExtensions(type).includes(extension);
   }

   public useLoader(loader: ILoader) {
      this.loaders.push(loader.call(this));
   }

   public usePlugin<T extends IPlugin>(plugin: T): ReturnType<T> {
      return plugin.call(this);
   }

   public resolve(relativeSource: string, options?: Partial<IResolveOptions>) {
      return resolve.call(this, relativeSource, options);
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

   public async run() {
      const graph = await getDependencyGraph.call(this);
      const result = await bundle.call(this, graph);

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
