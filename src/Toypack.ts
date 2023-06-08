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
import {
   getDependencyGraph,
   IModuleOptions,
   IParseCSSResult,
   IParseJSResult,
} from "./graph.js";
import { Hooks } from "./Hooks.js";
import JSONLoader from "./loaders/JSONLoader.js";
import { defaultOptions, IMode, IOptions } from "./options.js";
import { resolve, IResolveOptions } from "./resolve.js";
import { isNodeModule, mergeDeep } from "./utils.js";

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
   compile: (data: ICompileData) => Promise<ICompileResult | ICompileRecursive>;
}

interface ILoaderDataSync extends ILoaderDataBase {
   async: false;
   /** Function that handles the compilation of the matched files. */
   compile: (data: ICompileData) => ICompileResult | ICompileRecursive;
}

type ILoaderData = ILoaderDataAsync | ILoaderDataSync;

interface ICache {
   parsed: Map<string, IParseJSResult | IParseCSSResult>;
   compiled: Map<
      string,
      {
         runtime: string;
         code: string;
         map?: RawSourceMap | null;
      }
   >;
}

export type ILoader = (this: Toypack) => ILoaderData;
export type IPlugin = (this: Toypack) => any;

const isChunk = (source: string) =>
   new RegExp(".chunk-[a-zA-Z0-9]+-[0-9].[a-zA-Z]+$").test(source);

export class Toypack {
   private iframe: HTMLIFrameElement | null = null;
   private extensions = {
      resource: [...resourceExtensions],
      style: [...styleExtensions],
      script: [...appExtensions],
   };
   protected loaders: ILoaderData[] = [];
   protected assets: Map<string, Asset>;
   protected cachedDeps: ICache = {
      parsed: new Map(),
      compiled: new Map(),
   };
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

   public addOrUpdateAsset(source: string, content: string | Blob = "") {
      source = path.join("/", source);
      let asset = this.assets.get(source);

      if (!asset) {
         asset = new Asset(this, source, content);
         this.assets.set(source, asset);
      } else {
         asset.content = content;
      }

      asset.modified = true;
      return asset;
   }

   public getAsset(source: string) {
      source = path.join("/", source);
      return this.assets.get(source) || null;
   }

   public clearAsset() {
      this.assets.clear();
      this.clearCache();
   }

   public clearCache() {
      this.cachedDeps.compiled.clear();
      this.cachedDeps.parsed.clear();
   }

   public removeAsset(source: string) {
      source = path.join("/", source);

      this.assets.delete(source);
      this.cachedDeps.parsed.delete(source);
      this.cachedDeps.compiled.delete(source);

      /**
       * Remove chunks from cache that are associated with the deleted asset.
       * @todo Find a better fix because this solution will not work if the
       * user creates an asset with chunk source format which is -
       * `/path/name.chunk-[hash]-1.ext`.
       */
      this.cachedDeps.parsed.forEach((cache, cacheSource) => {
         if (source.startsWith(cacheSource) && isChunk(cacheSource)) {
            this.cachedDeps.parsed.delete(cacheSource);
         }
      });

      this.cachedDeps.compiled.forEach((cache, cacheSource) => {
         if (source.startsWith(cacheSource) && isChunk(cacheSource)) {
            this.cachedDeps.compiled.delete(cacheSource);
         }
      });
   }

   public async run(isProd = false) {
      const oldMode = this.options.bundleOptions.mode;
      this.options.bundleOptions.mode = isProd ? "production" : "development";
      const graph = await getDependencyGraph.call(this);
      const result = await bundle.call(this, graph);
      this.options.bundleOptions.mode = oldMode;

      // Set modified flag to false for all assets except those in node_modules
      this.assets.forEach((asset) => {
         if (isNodeModule(asset.source)) return;
         asset.modified = false;
      });

      // IFrame
      if (!isProd && this.iframe) {
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
