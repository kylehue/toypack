import path from "path-browserify";
import { RawSourceMap } from "source-map-js";
import { PartialDeep } from "type-fest";
import htmlPlugin from "./build-plugins/html-plugin.js";
import jsonPlugin from "./build-plugins/json-plugin.js";
import rawPlugin from "./build-plugins/raw-plugin.js";
import importUrlPlugin from "./build-plugins/import-url-plugin.js";
import sassPlugin from "./build-plugins/sass-plugin.js";
import vuePlugin from "./build-plugins/vue-plugin.js";
import { bundle } from "./bundle/index.js";
import { ToypackConfig, defaultConfig } from "./config.js";
import { getDependencyGraph } from "./graph/index.js";
import { Hooks } from "./Hooks.js";
import { PluginManager } from "./plugin/PluginManager.js";
import { Asset, ResolveOptions, Plugin, Loader } from "./types.js";
import {
   resolve,
   mergeObjects,
   createAsset,
   isValidAssetSource,
   ERRORS,
   EXTENSIONS,
   isNodeModule,
} from "./utils";
import { LoadChunkResult } from "./graph/load-chunk.js";
import { ParsedScriptResult } from "./graph/parse-script-chunk.js";
import { ParsedStyleResult } from "./graph/parse-style-chunk.js";
import {
   PackageProvider,
   fetchPackage,
   test,
} from "./package-manager/index.js";
import { getPackageInfoFromUrl } from "./package-manager/utils";

export class Toypack extends Hooks {
   private _iframe: HTMLIFrameElement | null = null;
   private _extensions = {
      resource: [...EXTENSIONS.resource],
      style: [...EXTENSIONS.style],
      script: [...EXTENSIONS.script],
   };
   private _assets = new Map<string, Asset>();
   private _config: ToypackConfig = JSON.parse(JSON.stringify(defaultConfig));
   private _loaders: { plugin: ReturnType<Plugin>; loader: Loader }[] = [];
   private _packageProviders: PackageProvider[] = [];
   protected _pluginManager = new PluginManager(this);
   protected _cachedDeps: ICache = {
      parsed: new Map(),
      compiled: new Map(),
      nodeModules: new Map(),
   };
   constructor(config?: PartialDeep<ToypackConfig>) {
      super();
      if (config) this.setConfig(config);

      this.usePlugin(
         jsonPlugin(),
         htmlPlugin(),
         vuePlugin(),
         sassPlugin(),
         rawPlugin(),
         importUrlPlugin()
      );

      if (
         this._config.logLevel == "error" ||
         this._config.logLevel == "warn" ||
         this._config.logLevel == "info"
      ) {
         this.onError((error) => {
            console.error(error.reason);
         });
      }

      this.usePackageProvider({
         host: "esm.sh",
         dtsHeader: "X-Typescript-Types",
      });

      this.usePackageProvider({
         host: "cdn.jsdelivr.net",
         postpath: "+esm",
         prepath: "npm",
         // We can get the entry's version in the banner
         handleEntryVersion({ rawContent, name }) {
            const banner = /^\/\*\*(?<banner>(?:\n|.)*)\*\//.exec(rawContent)
               ?.groups?.banner;
            if (!banner) return;
            const version = new RegExp(
               `.*Original file: /npm/${name}@v?(?<version>[\\.a-z0-9]+).*/`
            ).exec(banner)?.groups?.version;
            return version;
         },
      });

      this.usePackageProvider({
         host: "cdn.skypack.dev",
         dtsHeader: "X-Typescript-Types",
         queryParams: {
            dts: true,
         },
         isBadResponse(response, { name }) {
            if (
               new RegExp(`cdn\\.skypack\\.dev/error/.*${name}@.*`).test(
                  response.url
               )
            ) {
               return true;
            }

            return false;
         },
         // We can get the entry's version in dts
         handleEntryVersion({ response }) {
            const dtsUrl = response.headers.get(this.dtsHeader!);
            if (!dtsUrl) return;
            return getPackageInfoFromUrl(dtsUrl, this, "")?.version;
         },
      });
   }

   protected _getLoadersFor(source: string) {
      const result: typeof this._loaders = [];
      for (const { loader, plugin } of this._loaders) {
         let hasMatched = false;
         if (typeof loader.test == "function" && loader.test(source)) {
            hasMatched = true;
         } else if (loader.test instanceof RegExp && loader.test.test(source)) {
            hasMatched = true;
         }

         if (hasMatched) {
            result.push({ loader, plugin });
            if (loader.disableChaining === true) break;
         }
      }

      return result;
   }

   protected _getTypeFromSource(source: string) {
      let type: keyof typeof this._extensions | null = null;
      if (this._hasExtension("script", source)) {
         type = "script";
      } else if (this._hasExtension("style", source)) {
         type = "style";
      } else if (this._hasExtension("resource", source)) {
         type = "resource";
      }

      return type;
   }

   protected _getExtensions(type: keyof typeof this._extensions) {
      return this._extensions[type];
   }

   protected _hasExtension(
      type: keyof typeof this._extensions,
      source: string
   ) {
      if (!source) {
         throw new Error("Source must be string. Received " + source);
      }

      source = source.split("?")[0];
      const extension = path.extname(source);
      return this._getExtensions(type).includes(extension);
   }

   protected _getPackageProviders() {
      return this._packageProviders;
   }

   public async installPackage(name: string, version?: string) {
      const pkg = await fetchPackage.call(this, name, version);
      for (const pkgAsset of Object.values(pkg.assets)) {
         this.addOrUpdateAsset(pkgAsset.source, pkgAsset.content);
         this._cachedDeps.nodeModules.set(pkgAsset.source, {
            map: pkgAsset.map,
         });
      }
      //const pkg = await test.call(this, name, version);
   }

   /**
    * Add a provider to be used in package manager.
    * @param provider The package provider.
    * @param isMainProvider Set to true to always use this provider first.
    */
   public usePackageProvider(
      provider: PackageProvider,
      isMainProvider = false
   ) {
      if (isMainProvider) {
         this._packageProviders.unshift(provider);
      } else {
         this._packageProviders.push(provider);
      }
   }

   /**
    * Add plugins to the bundler.
    */
   public usePlugin(...plugins: ReturnType<Plugin>[]) {
      for (const plugin of plugins) {
         this._pluginManager.registerPlugin(plugin);

         if (plugin.extensions) {
            for (const ext of plugin.extensions) {
               if (!this._hasExtension(ext[0], ext[1])) {
                  this._extensions[ext[0]].push(ext[1]);
               }
            }
         }

         if (plugin.loaders) {
            for (const loader of plugin.loaders) {
               this._loaders.push({ loader, plugin });
            }
         }
      }
   }

   public setConfig(config: PartialDeep<ToypackConfig>) {
      this.clearCache();
      this._config = mergeObjects(this._config, config as ToypackConfig);
   }

   public getConfig(): ToypackConfig {
      return this._config;
   }

   /**
    * Resolves a relative source path.
    * @param {string} relativeSource The relative source path to resolve.
    * @param {Partial<ResolveOptions>} [options] Optional resolve options.
    * @returns {string} The resolved absolute path.
    */
   public resolve(relativeSource: string, options?: Partial<ResolveOptions>) {
      const opts = Object.assign(
         {
            aliases: this._config.bundle.resolve.alias,
            fallbacks: this._config.bundle.resolve.fallback,
            extensions: this._config.bundle.resolve.extensions,
         } as ResolveOptions,
         options || {}
      );

      opts.extensions = [
         ...new Set([
            ...opts.extensions,
            ...this._extensions.script,
            ...this._extensions.style,
            ...this._extensions.resource,
         ]),
      ];

      const assets: Record<string, string> = {};

      for (const [source, asset] of this._assets) {
         assets[source] = typeof asset.content == "string" ? asset.content : "";
      }

      return resolve(assets, relativeSource, opts);
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
      if (!isValidAssetSource(source)) {
         this._trigger("onError", ERRORS.invalidAssetSource(source));
         return {} as Asset;
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
      source = path.join("/", source.split("?")[0]);
      return this._assets.get(source) || null;
   }

   public clearAsset() {
      /**
       * Don't do this._assets.clear() because that won't revoke the
       * object urls of blobs.
       */
      this._assets.forEach((asset) => {
         this.removeAsset(asset.source);
      });

      this.clearCache();
   }

   public clearCache() {
      this._cachedDeps.compiled.clear();
      this._cachedDeps.parsed.clear();
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
      this._cachedDeps.parsed.forEach((cache, cacheSource) => {
         if (cache.asset.source === asset.source) {
            this._cachedDeps.parsed.delete(cacheSource);
         }
      });

      this._cachedDeps.compiled.forEach((cache, cacheSource) => {
         if (cache.asset.source === asset.source) {
            this._cachedDeps.compiled.delete(cacheSource);
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
      // const oldMode = this._config.bundle.mode;
      // this._config.bundle.mode = isProd ? "production" : oldMode;
      // const graph = await getDependencyGraph.call(this);
      // console.log(graph);
      // const result = await bundle.call(this, graph);
      // this._config.bundle.mode = oldMode;
      // // Set modified flag to false for all assets (used in caching)
      // this._assets.forEach((asset) => {
      //    asset.modified = false;
      // });
      // // IFrame
      // if (!isProd && this._iframe) {
      //    this._iframe.srcdoc = result.html.content;
      // }
      // return result;
   }
}

// Lib exports & types
export default Toypack;
export * as Babel from "@babel/standalone";
export { CodeComposer } from "./utils/CodeComposer.js";
export type { ToypackConfig, Asset };

interface ICache {
   parsed: Map<
      string,
      {
         asset: Asset;
         parsed: ParsedScriptResult | ParsedStyleResult | null;
         loaded: LoadChunkResult;
      }
   >;
   compiled: Map<
      string,
      {
         asset: Asset;
         content: string;
         map?: RawSourceMap | null;
      }
   >;
   nodeModules: Map<
      string,
      {
         map?: RawSourceMap | null;
      }
   >;
}
