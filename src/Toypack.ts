import path from "path-browserify";
import { RawSourceMap } from "source-map-js";
import { PartialDeep } from "type-fest";
import { IAsset, createAsset } from "./asset.js";
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
import { defaultOptions, IOptions } from "./options.js";
import { resolve, IResolveOptions } from "./resolve.js";
import { isChunk, isNodeModule, mergeDeep } from "./utils.js";
import JSONLoader from "./loaders/JSONLoader.js";
import HTMLLoader from "./loaders/HTMLLoader.js";

export class Toypack {
   private iframe: HTMLIFrameElement | null = null;
   private extensions = {
      resource: [...resourceExtensions],
      style: [...styleExtensions],
      script: [...appExtensions],
   };
   protected loaders: ILoaderData[] = [];
   protected assets: Map<string, IAsset>;
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
      this.useLoader(HTMLLoader({ sourceMap: false }));

      if (this.options.logLevel == "error") {
         this.hooks.onError((error) => {
            console.error(error.reason);
         });
      }
   }

   protected warn(message: string) {
      if (this.options.logLevel == "error" || this.options.logLevel == "warn") {
         console.warn(message);
      }
   }

   protected getExtensions(type: keyof typeof this.extensions) {
      return this.extensions[type];
   }

   protected addExtension(type: keyof typeof this.extensions, ext: string) {
      if (!this.hasExtension(type, "h" + ext)) {
         this.getExtensions(type).push(ext);
      }
   }

   protected hasExtension(type: keyof typeof this.extensions, source: string) {
      const extension = path.extname(source);
      return this.getExtensions(type).includes(extension);
   }

   /**
    * Adds a loader to the list of loaders.
    * @param {ILoader} loader The loader to add.
    */
   public useLoader(loader: ILoader) {
      const loadedLoader = loader.call(this);
      if (this.loaders.find((v) => v.name == loadedLoader.name)) {
         throw new Error(`${loadedLoader.name} already exists.`);
      }

      this.loaders.push(loadedLoader);
   }

   /**
    * Adds a plugin to Toypack.
    * @param {IPlugin} plugin The plugin to add.
    * @returns {ReturnType<IPlugin>}
    */
   public usePlugin<T extends IPlugin>(plugin: T): ReturnType<T> {
      return plugin.call(this);
   }

   /**
    * Resolves a relative source path.
    * @param {string} relativeSource The relative source path to resolve.
    * @param {Partial<IResolveOptions>} [options] Optional resolve options.
    * @returns {string} The resolved absolute path.
    */
   public resolve(relativeSource: string, options?: Partial<IResolveOptions>) {
      return resolve.call(this, relativeSource, options);
   }

   /**
    * Sets the HTML iframe element to be used for displaying the
    * result in development mode.
    * @param {HTMLIFrameElement} iframe The HTML iframe element.
    */
   public setIFrame(iframe: HTMLIFrameElement) {
      this.iframe = iframe;
   }

   /**
    * Unsets the HTML iframe element.
    */
   public unsetIFrame() {
      this.iframe = null;
   }

   /**
    * Adds or updates an asset with the given source and content.
    * @param {string} source The source file path of the asset.
    * @param {string | Blob} [content=""] The content of the asset.
    * @returns {Asset} The created or updated Asset object.
    */
   public addOrUpdateAsset(source: string, content: string | Blob = "") {
      source = path.join("/", source);
      let asset = this.assets.get(source);

      if (!asset) {
         asset = createAsset(source, content);
         this.assets.set(source, asset);
      } else {
         asset.content = content;
      }

      if (asset.type == "text") {
         asset.modified = true;
      }

      return asset;
   }

   /**
    * Retrieves the Asset object associated with the given source.
    * @param {string} source The source file path of the asset.
    * @returns {Asset | null} The Asset object if found, otherwise null.
    */
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

   /**
    * Removes the asset with the given source.
    * @param {string} source The source file path of the asset to remove.
    */
   public removeAsset(source: string) {
      source = path.join("/", source);
      const asset = this.assets.get(source);
      if (!asset) return;

      if (asset.type == "resource" && asset.contentURL) {
         URL.revokeObjectURL(asset.contentURL);
      }

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

   /**
    * Runs the compilation process.
    * @param {boolean} [isProd=false] Indicates whether to run in
    * production mode.
    * @returns {Promise} A promise that resolves with the result
    * of the bundling process.
    */
   public async run(isProd = false) {
      const oldMode = this.options.bundleOptions.mode;
      this.options.bundleOptions.mode = isProd ? "production" : "development";
      const graph = await getDependencyGraph.call(this);
      const result = await bundle.call(this, graph);
      this.options.bundleOptions.mode = oldMode;

      // Set modified flag to false for all assets except those in node_modules
      this.assets.forEach((asset) => {
         if (isNodeModule(asset.source) || asset.type != "text") return;
         asset.modified = false;
      });

      // IFrame
      if (!isProd && this.iframe) {
         this.iframe.srcdoc = result.html.content;
      }

      console.log(graph);
      return result;
   }
}

// Lib exports & types
export default Toypack;
export * as Babel from "@babel/standalone";
export * as Utilities from "./utils.js";
export { CodeComposer } from "./CodeComposer.js";
export type { IOptions, RawSourceMap, IAsset };
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

export interface ICompileData {
   source: string;
   content: string | Blob;
   options: IModuleOptions;
}

interface ICompileBaseResult {
   type: "result";
   content: string;
   map?: RawSourceMap;
}

/**
 * Represents a recursive compile object, indicating that further
 * compilation is required.
 */
interface ICompileRecursiveResult {
   type: "recurse";
   /**
    * Specifies the usage of different formats for the asset.
    * The key represents the format, such as 'less', 'scss', 'ts', etc.
    * The value is an array of `ICompileData` objects representing
    * the data to be compiled by other loaders.
    */
   chunks: Record<string, Omit<ICompileBaseResult, "type">[]>;
}

export type ICompileResult = ICompileBaseResult | ICompileRecursiveResult;

interface ILoaderDataBase {
   /** The name of the loader. */
   name: string;
   /** Regular expression pattern used to match the asset source that the loader should be applied to. */
   test: RegExp;
}

interface ILoaderDataAsync extends ILoaderDataBase {
   async: true;
   /** Async function that handles the compilation of the matched files. */
   compile: (data: ICompileData) => Promise<ICompileResult>;
}

interface ILoaderDataSync extends ILoaderDataBase {
   async: false;
   /** Function that handles the compilation of the matched files. */
   compile: (data: ICompileData) => ICompileResult;
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
