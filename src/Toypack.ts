import path from "path-browserify";
import { RawSourceMap } from "source-map-js";
import { PartialDeep, ReadonlyDeep } from "type-fest";
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
import { Asset, ResolveOptions, Plugin, Loader, TextAsset } from "./types.js";
import {
   mergeObjects,
   isValidAssetSource,
   ERRORS,
   EXTENSIONS,
   parsePackageName,
   isLocal,
   isUrl,
   DEBUG,
} from "./utils";
import { createAsset } from "./utils/create-asset.js";
import { resolve } from "./utils/resolve.js";
import { LoadChunkResult } from "./graph/load-chunk.js";
import { ParsedScriptResult } from "./graph/parse-script-chunk.js";
import { ParsedStyleResult } from "./graph/parse-style-chunk.js";
import { PackageProvider, getPackage, test } from "./package-manager/index.js";

export class Toypack extends Hooks {
   private _iframe: HTMLIFrameElement | null = null;
   private _extensions = {
      resource: [...EXTENSIONS.resource],
      style: [...EXTENSIONS.style],
      script: [...EXTENSIONS.script],
   };
   private _assets = new Map<string, Asset>();
   private _config: ToypackConfig = JSON.parse(JSON.stringify(defaultConfig));
   private _loaders: { plugin: Plugin; loader: Loader }[] = [];
   private _packageProviders: PackageProvider[] = [];
   private _dependencies: Record<string, string> = {};
   protected _virtualAssets = new Map<string, Asset>();
   protected _pluginManager = new PluginManager(this);
   protected _cachedDeps: ICache = {
      parsed: new Map(),
      compiled: new Map(),
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
         host: "cdn.jsdelivr.net",
         postpath: ({ subpath }) => {
            if (!/\.css$/.test(subpath)) return "+esm";
         },
         prepath: "npm",
      });

      this.usePackageProvider({
         host: "esm.sh",
         dtsHeader: "X-Typescript-Types",
      });

      this.usePackageProvider({
         host: "cdn.skypack.dev",
         dtsHeader: "X-Typescript-Types",
         queryParams: {
            dts: true,
         },
         isBadResponse(res) {
            if (res.url == "https://cdn.skypack.dev/error") return false;
            return /cdn\.skypack\.dev\/error\/.*/.test(res.url);
         },
      });
   }

   public get dependencies() {
      return this._dependencies as ReadonlyDeep<typeof this._dependencies>;
   }

   public get config() {
      return this._config as ReadonlyDeep<typeof this._config>;
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

   /**
    * Install a package from providers.
    * @param source The source of the package to install.
    * @param version The version of the package to install. Defaults to
    * latest.
    */
   public async installPackage(source: string, version = "latest") {
      const pkg = await getPackage.call(this, source, version);
      if (!pkg.assets.length) return;

      this._dependencies[pkg.name] = pkg.version;

      const findDuplicateAsset = (url: string) => {
         for (const [_, asset] of this._assets) {
            if (asset.type != "text") continue;
            if (!asset.source.startsWith("/node_modules/")) continue;
            if (!asset.metadata.packageInfo) continue;
            if (asset.metadata.packageInfo.url != url) continue;
            return asset;
         }
      };

      for (const pkgAsset of pkg.assets) {
         const asset = this.addOrUpdateAsset<TextAsset>(
            pkgAsset.source,
            pkgAsset.content
         );

         asset.metadata.packageInfo = { url: pkgAsset.url };
         if (pkgAsset.type != "resource") {
            asset.map = pkgAsset.map;
         }

         // auto-dedupe same urls
         // note: this isn't the same as the dedupe in package manager
         const duplicateAsset = findDuplicateAsset(pkgAsset.url);
         if (duplicateAsset && duplicateAsset.source != asset.source) {
            asset.content =
               `export * from "${duplicateAsset.source}";` +
               `export {default} from "${duplicateAsset.source}";`;
         }
      }
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
   public usePlugin(...plugins: Plugin[]) {
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
    * Resolve a source path.
    * @param {string} relativeSource The source path to resolve.
    * @param {Partial<ResolveOptions>} [options] Optional resolve options.
    * @returns {string} The resolved absolute path.
    */
   public resolve(relativeSource: string, options?: Partial<ResolveOptions>) {
      if (relativeSource.startsWith("virtual:")) {
         return this._virtualAssets.get(relativeSource)?.source || null;
      }

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

      const result = resolve(assets, relativeSource, opts);

      if (!result) {
         const isNodeModule =
            !isLocal(relativeSource) && !isUrl(relativeSource);
         /**
          * If still not resolved, and it's an import from node_modules,
          * we'd probably need to resolve it with version. This is because
          * Toypack's paths of installed packages has the version in it.
          */
         if (isNodeModule) {
            const {
               name,
               subpath,
               version: _version,
            } = parsePackageName(relativeSource);
            const version = this._dependencies[name] || _version;
            relativeSource = `${name}@${version}${subpath}`;
         }

         return resolve(assets, relativeSource, opts);
      } else {
         return result;
      }
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
   public addOrUpdateAsset<T = Asset>(
      source: string,
      content: string | Blob = ""
   ): T {
      if (!isValidAssetSource(source)) {
         this._trigger("onError", ERRORS.invalidAssetSource(source));
         return {} as T;
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

      return asset as T;
   }

   /**
    * Retrieves the Asset object associated with the given source.
    * @param {string} source The source file path of the asset.
    * @returns {Asset | null} The Asset object if found, otherwise null.
    */
   public getAsset(source: string) {
      if (source.startsWith("virtual:")) {
         const asset = this._virtualAssets.get(source);
         if (asset) return this._virtualAssets.get(source);
      }
      
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
    * @param {boolean} [isProd=false] Indicates whether to run
    * in production mode.
    * @returns An object containing the bundle result.
    */
   public async run(isProd = false) {
      const oldMode = this._config.bundle.mode;
      this._config.bundle.mode = isProd ? "production" : oldMode;
      const timeBeforeGraph = performance.now();
      const graph = await getDependencyGraph.call(this);
      const timeAfterGraph = performance.now();
      console.log(graph);
      const timeBeforeBundle = performance.now();
      const result = await bundle.call(this, graph);
      const timeAfterBundle = performance.now();
      this._config.bundle.mode = oldMode;
      // Set modified flag to false for all assets (used in caching)
      this._assets.forEach((asset) => {
         asset.modified = false;
      });
      // IFrame
      if (!isProd && this._iframe) {
         this._iframe.srcdoc = result.html.content;
      }
      const totalGraphTime = Math.round(timeAfterGraph - timeBeforeGraph);
      const totalBundleTime = Math.round(timeAfterBundle - timeBeforeBundle);
      const message =
         `⏲ Graph  - ${totalGraphTime} ms\n` +
         `⏲ Bundle - ${totalBundleTime} ms\n` +
         `⏲ Total  - ${totalGraphTime + totalBundleTime} ms`;
      DEBUG.info(this._config.logLevel, message);
      return result;
   }
}

// Lib exports & types
export default Toypack;
export * as Babel from "@babel/standalone";
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
}
