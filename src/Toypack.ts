import path from "path-browserify";
import { RawSourceMap } from "source-map-js";
import { PartialDeep, Asyncify } from "type-fest";
import { IAsset, createAsset } from "./asset.js";
import { bundle } from "./bundle/index.js";
import {
   appExtensions,
   resourceExtensions,
   styleExtensions,
} from "./extensions.js";
import { getDependencyGraph } from "./graph/index.js";
import { Hooks } from "./Hooks.js";
import { defaultConfig, IToypackConfig } from "./config.js";
import { resolve, IResolveOptions } from "./resolve.js";
import {
   getHash,
   isNodeModule,
   isValidSource,
   mergeDeep,
   parseURL,
} from "./utils.js";
import JSONLoader from "./loaders/JSONLoader.js";
import HTMLLoader from "./loaders/HTMLLoader.js";
import RawLoader from "./loaders/RawLoader.js";
import { IParsedAsset } from "./graph/parseAsset.js";
import { invalidAssetSourceError } from "./errors.js";
import { CssNode } from "css-tree";

export class Toypack {
   private _iframe: HTMLIFrameElement | null = null;
   private _extensions = {
      resource: [...resourceExtensions],
      style: [...styleExtensions],
      script: [...appExtensions],
   };
   private _assets: Map<string, IAsset> = new Map();
   private _buildHooks: { [key in keyof IBuildHooks]: IBuildHooks[key][] } = {};
   protected loaders: ILoaderData[] = [];
   protected cachedDeps: ICache = {
      parsed: new Map(),
      compiled: new Map(),
   };
   public config: IToypackConfig;
   public hooks = new Hooks();
   constructor(config?: PartialDeep<IToypackConfig>) {
      this.config = mergeDeep(
         JSON.parse(JSON.stringify(defaultConfig)),
         config
      );

      this.useLoader(RawLoader(), JSONLoader(), HTMLLoader());

      if (this.config.logLevel == "error") {
         this.hooks.onError((error) => {
            console.error(error.reason);
         });
      }
   }

   protected warn(message: string) {
      if (this.config.logLevel == "error" || this.config.logLevel == "warn") {
         console.warn(message);
      }
   }

   protected getExtensions(type: keyof typeof this._extensions) {
      return this._extensions[type];
   }

   protected hasExtension(type: keyof typeof this._extensions, source: string) {
      if (!source) {
         throw new Error("Source must be string. Received " + source);
      }

      const parsed = parseURL(source);
      const extension = path.extname(parsed.target);
      return this.getExtensions(type).includes(extension);
   }

   /**
    * Convert a resource's source path to a useable source path.
    * If in development mode, the resource path will become a blob url.
    * If in production mode, the resource path will have a unique hash as
    * its basename.
    * @returns The useable source path string.
    */
   protected resourceSourceToUseableSource(
      source: string,
      baseDir: string = "."
   ) {
      const resolvedSource = this.resolve(source, { baseDir });
      const asset = resolvedSource ? this.getAsset(resolvedSource) : null;
      if (!asset || asset.type != "resource") return null;
      if (this.config.bundle.mode == "production") {
         return "./" + getHash(asset.source) + path.extname(asset.source);
      } else {
         return asset.contentURL;
      }
   }

   /**
    * Adds loaders to the list of loaders.
    * @param {ILoader} loaders The loaders to add.
    */
   public useLoader(...loaders: ILoader[]) {
      for (const loader of loaders) {
         const loaderDataDefaults = {
            chaining: true,
            extensions: [] as NonNullable<ILoaderData["extensions"]>,
         };

         const loaderData = Object.assign(
            loaderDataDefaults,
            loader.call(this)
         );

         for (const [group, ext] of loaderData.extensions) {
            this._extensions[group].push(ext);
         }

         this.loaders.push(loaderData);
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
      this._iframe = iframe;
   }

   /**
    * Unsets the HTML iframe element.
    */
   public unsetIFrame() {
      this._iframe = null;
   }

   /**
    * Adds or updates an asset with the given source and content.
    * @param {string} source The source path of the asset.
    * @param {string | Blob} [content=""] The content of the asset.
    * @returns {Asset} The created or updated Asset object.
    */
   public addOrUpdateAsset(source: string, content: string | Blob = "") {
      if (!isValidSource(source)) {
         this.hooks.trigger("onError", invalidAssetSourceError(source));
         return {} as IAsset;
      }

      source = path.join("/", source);

      let asset = this._assets.get(source);

      if (!asset) {
         asset = createAsset(source, content);
         this._assets.set(source, asset);
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
      return this._assets.get(source) || null;
   }

   public clearAsset() {
      this._assets.forEach((asset) => {
         this.removeAsset(asset.source);
      });

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

      const asset = this._assets.get(source);
      if (!asset) return;

      if (asset.type == "resource" && asset.contentURL) {
         URL.revokeObjectURL(asset.contentURL);
      }

      this._assets.delete(source);

      // Remove from cache
      this.cachedDeps.parsed.forEach((cache, cacheSource) => {
         if (cache.asset.source === asset.source) {
            this.cachedDeps.parsed.delete(cacheSource);
         }
      });

      this.cachedDeps.compiled.forEach((cache, cacheSource) => {
         if (cache.asset.source === asset.source) {
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
      const oldMode = this.config.bundle.mode;
      this.config.bundle.mode = isProd ? "production" : oldMode;
      const graph = await getDependencyGraph.call(this);
      console.log(graph);
      const result = await bundle.call(this, graph);
      this.config.bundle.mode = oldMode;

      // Set modified flag to false for all assets except those in node_modules
      this._assets.forEach((asset) => {
         if (isNodeModule(asset.source) || asset.type == "resource") return;
         asset.modified = false;
      });

      // IFrame
      if (!isProd && this._iframe) {
         this._iframe.srcdoc = result.html.content;
      }

      return result;
   }
}

// Lib exports & types
export default Toypack;
export * as Babel from "@babel/standalone";
export { CodeComposer } from "./CodeComposer.js";
export type { IToypackConfig, IAsset };

interface ICache {
   parsed: Map<
      string,
      {
         asset: IAsset;
         parsed: IParsedAsset;
      }
   >;
   compiled: Map<
      string,
      {
         asset: IAsset;
         content: string;
         map?: RawSourceMap | null;
      }
   >;
}

export type ILoaderResult = Record<
   string,
   {
      content: string;
      map?: RawSourceMap;
   }[]
>;

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
    * Determines if the loader should be chainable with other loaders.
    * If set to false, the bundler will exclude other loaders and
    * exclusively use this loader. Defaults to true.
    */
   chaining?: boolean;
   /** Function that handles the compilation of the matched files. */
   compile: (
      data: IRawDependencyData
   ) => ILoaderResult | Promise<ILoaderResult>;
   /** Extensions to add to the bundler. */
   extensions?: [keyof InstanceType<typeof Toypack>["_extensions"], string][];
}

interface IRawDependencyData {
   source: string;
   content: string | Blob;
   params: IDependencyImportParams;
}

type IDependencyImportParams = ReturnType<typeof parseURL>["params"];

export type ILoader = (this: Toypack) => ILoaderData;
export type IPlugin = (this: Toypack) => any;

interface IBuildHooks {
   load?: (dep: {
      source: string;
      params: IDependencyImportParams;
      content: string | Blob;
   }) => ILoaderResult | void | Promise<ILoaderResult | void>;
   transform?: (dep: any) => void;
   resolve?: (id: string) => string;
   beforeFinalize?: (content: any) => void;
   afterFinalize?: (content: any) => void;
   config?: (config: IToypackConfig) => Partial<IToypackConfig>;
   start?: () => void;
}

type plugin = () => IBuildHooks;

const myPlugin: plugin = () => {
   let config: IToypackConfig;
   return {
      start() {
         
      },
      load(dep) {
         if (!dep.params.raw) return;

         return {
            js: []
         }
      },
      resolve(id) {
         return id;
      },
   };
};

let test = myPlugin();