import path from "path-browserify";
import { RawSourceMap } from "source-map-js";
import { PartialDeep } from "type-fest";
import { IAsset, createAsset } from "./asset.js";
import { bundle } from "./bundle/index.js";
import {
   appExtensions,
   resourceExtensions,
   styleExtensions,
} from "./extensions.js";
import {
   getDependencyGraph,
   IDependencyImportParams,
   IParseCSSResult,
   IParseJSResult,
} from "./graph/index.js";
import { Hooks } from "./Hooks.js";
import { defaultOptions, IOptions } from "./options.js";
import { resolve, IResolveOptions } from "./resolve.js";
import { isChunk, isNodeModule, mergeDeep } from "./utils.js";
import JSONLoader from "./loaders/JSONLoader.js";
import HTMLLoader from "./loaders/HTMLLoader.js";
import RawLoader from "./loaders/RawLoader.js";
import VueLoader from "./loaders/VueLoader.js";
import SassLoader from "./loaders/SassLoader.js";
import ChainLoader from "./loaders/ChainLoader.js";

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
      this.useLoader(
         RawLoader(),
         JSONLoader(),
         HTMLLoader(),
         ChainLoader(),
         VueLoader(),
         SassLoader()
      );

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

   /**
    * Add an extension to the bundler. The bundler uses the extensions
    * to divide the dependencies into script, style, and resource.
    * @param type Where the extension would fall into.
    * @param ext The extension.
    */
   protected addExtension(type: keyof typeof this.extensions, ext: string | string[]) {
      if (Array.isArray(ext)) {
         for (let x of ext) {
            if (!this.hasExtension(type, "h" + x)) {
               this.getExtensions(type).push(x);
            }
         }
      } else {
         if (!this.hasExtension(type, "h" + ext)) {
            this.getExtensions(type).push(ext);
         }
      }
   }

   protected getExtensions(type: keyof typeof this.extensions) {
      return this.extensions[type];
   }

   protected hasExtension(type: keyof typeof this.extensions, source: string) {
      const extension = path.extname(source);
      return this.getExtensions(type).includes(extension);
   }

   /**
    * Adds loaders to the list of loaders.
    * @param {ILoader} loaders The loaders to add.
    */
   public useLoader(...loaders: ILoader[]) {
      for (const loader of loaders) {
         const loadedLoader = Object.assign(
            {
               chaining: true,
            } as ILoaderData,
            loader.call(this)
         );

         if (this.loaders.find((v) => v.name == loadedLoader.name)) {
            throw new Error(`${loadedLoader.name} already exists.`);
         }

         this.loaders.push(loadedLoader);
      }
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
       * @todo Find a better fix because this solution will create a bug if
       * the user creates an asset with chunk source format.
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
      console.log(graph);

      const result = await bundle.call(this, graph);
      this.options.bundleOptions.mode = oldMode;

      // // Set modified flag to false for all assets except those in node_modules
      // this.assets.forEach((asset) => {
      //    if (isNodeModule(asset.source) || asset.type != "text") return;
      //    asset.modified = false;
      // });

      // // IFrame
      // if (!isProd && this.iframe) {
      //    this.iframe.srcdoc = result.html.content;
      // }

      // console.log(graph);
      // return result;
   }
}

// Lib exports & types
export default Toypack;
export * as Babel from "@babel/standalone";
export * as Utilities from "./utils.js";
export { CodeComposer } from "./CodeComposer.js";
//export type { IOptions, RawSourceMap, IAsset };
/* export type {
   IChunk,
   IDependency,
   IDependencyMap,
   IDependencyMapSource,
   IDependencyImportParams as IModuleOptions,
   IResourceDependency,
   IScriptDependency,
   IStyleDependency,
} from "./graph/index.js"; */

export interface IRawDependencyData {
   source: string;
   content: string | Blob;
   params: IDependencyImportParams;
}

export interface IChunk {
   content: string;
   map?: RawSourceMap;
}

export interface ILoaderResult {
   /**
    * The main language to use in the contents.
    */
   mainLang: string;
   /**
    * Record of compiled contents. The key is the language and the value
    * is an array of compiled contents.
    */
   contents: Record<string, IChunk[]>;
}

export interface ILoaderData {
   /** The name of the loader. */
   name: string;
   /**
    * A regular expression pattern or function used to match the asset
    * source that the loader should be applied to.
    */
   test:
      | RegExp
      | ((source: string, params: IDependencyImportParams) => boolean);
   /**
    * Determines if the loader is chainable with other loaders.
    * If set to false, the bundler will exclude other loaders and
    * exclusively use this loader. Defaults to true.
    */
   chaining?: boolean;
   /** Function that handles the compilation of the matched files. */
   compile: (data: IRawDependencyData) => ILoaderResult | Promise<ILoaderResult>;
}

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
