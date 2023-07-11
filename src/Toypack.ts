import path from "path-browserify";
import { PartialDeep, ReadonlyDeep } from "type-fest";
import htmlPlugin from "./build-plugins/html-plugin.js";
import jsonPlugin from "./build-plugins/json-plugin.js";
import rawPlugin from "./build-plugins/raw-plugin.js";
import importUrlPlugin from "./build-plugins/import-url-plugin.js";
import { bundle } from "./bundle/index.js";
import { ToypackConfig, defaultConfig } from "./config.js";
import { Importers, getDependencyGraph } from "./graph/index.js";
import { Hooks } from "./Hooks.js";
import { PluginManager } from "./plugin/PluginManager.js";
import { Asset, ResolveOptions, Plugin, TextAsset } from "./types.js";
import {
   DEBUG,
   ERRORS,
   EXTENSIONS,
   getHash,
   isLocal,
   isUrl,
   isValidAssetSource,
   mergeObjects,
   parsePackageName,
} from "./utils";
import { createAsset } from "./utils/create-asset.js";
import { resolve } from "./utils/resolve.js";
import { LoadChunkResult } from "./graph/load-chunk.js";
import { ParsedScriptResult } from "./graph/parse-script-chunk.js";
import { ParsedStyleResult } from "./graph/parse-style-chunk.js";
import { PackageProvider, getPackage } from "./package-manager/index.js";
import { EncodedSourceMap } from "@jridgewell/gen-mapping";

export class Toypack extends Hooks {
   private _iframe: HTMLIFrameElement | null = null;
   private _extensions = {
      resource: [...EXTENSIONS.resource],
      style: [...EXTENSIONS.style],
      script: [...EXTENSIONS.script],
   };
   private _assets = new Map<string, Asset>();
   private _config: ToypackConfig = JSON.parse(JSON.stringify(defaultConfig));
   private _packageProviders: PackageProvider[] = [];
   private _dependencies: Record<string, string> = {};
   private _configHash: string = "";
   private _cachedDeps: Cache = {
      parsed: new Map(),
      compiled: new Map(),
   };
   protected _virtualAssets = new Map<string, Asset>();
   protected _pluginManager = new PluginManager(this);
   constructor(config?: PartialDeep<ToypackConfig>) {
      super();
      if (config) this.setConfig(config);

      for (const plugin of this.config.plugins) {
         this.usePlugin(plugin as any);
      }

      this.usePlugin(
         jsonPlugin(),
         htmlPlugin(),
         rawPlugin(),
         importUrlPlugin()
      );

      this.onError((error) => {
         DEBUG.error(this.config.logLevel, console.error)?.(error.reason);
      });

      this.usePackageProvider({
         host: "esm.sh",
         dtsHeader: "X-Typescript-Types",
      });

      this.usePackageProvider({
         host: "cdn.jsdelivr.net",
         postpath: ({ subpath }) => {
            if (!/\.css$/.test(subpath)) return "+esm";
         },
         prepath: "npm",
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

   protected _getCache<
      T extends keyof typeof this._cachedDeps,
      K extends T extends "parsed" ? Cache["parsed"] : Cache["compiled"],
      R extends K extends Map<string, infer I> ? I : never
   >(loc: T, source: string): R | null {
      const hashedSource = this._configHash + "-" + source;
      return (this._cachedDeps[loc].get(hashedSource) || null) as R | null;
   }

   protected _setCache<
      T extends keyof typeof this._cachedDeps,
      K extends T extends "parsed" ? Cache["parsed"] : Cache["compiled"],
      R extends K extends Map<string, infer I> ? I : never
   >(loc: T, source: string, value: Omit<R, "source">) {
      const hashedSource = this._configHash + "-" + source;
      const cacheData = { source, ...value };
      const cached = this._getCache(loc, source);
      if (cached) {
         Object.assign(cached, cacheData);
      } else {
         this._cachedDeps[loc].set(hashedSource, cacheData);
      }
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
    * Installs a package from providers.
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

         asset.metadata.packageInfo = {
            url: pkgAsset.url,
            type: pkgAsset.type,
         };

         asset.forceContentTypeAs ||=
            pkgAsset.type != "resource" ? pkgAsset.type : undefined;

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

      this._trigger("onInstallPackage", pkg);
   }

   /**
    * Adds a provider to be used in package manager.
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
    * Adds plugins to the bundler.
    */
   public usePlugin(...plugins: Plugin[]) {
      for (const plugin of plugins) {
         this._pluginManager.registerPlugin(plugin);

         for (const ext of plugin.extensions || []) {
            if (!this._hasExtension(ext[0], ext[1])) {
               this._extensions[ext[0]].push(ext[1]);
            }
         }
      }
   }

   public setConfig(config: PartialDeep<ToypackConfig>) {
      this._config = mergeObjects(this._config, config as ToypackConfig);
      this._configHash = getHash(JSON.stringify(this._config));
   }

   public getConfig(): ToypackConfig {
      return this._config;
   }

   public getAssetSources() {
      return Object.keys(Object.fromEntries(this._assets));
   }

   /**
    * Resolve a source path.
    * @param source The source path to resolve.
    * @param options Optional resolve options.
    * @returns The resolved absolute path.
    */
   public resolve(source: string, options?: Partial<ResolveOptions>) {
      if (source.startsWith("virtual:")) {
         return this._virtualAssets.get(source)?.source || null;
      }

      const opts = Object.assign(
         {
            aliases: this.config.bundle.resolve.alias,
            fallbacks: this.config.bundle.resolve.fallback,
            extensions: this.config.bundle.resolve.extensions,
            extensionAlias: this.config.bundle.resolve.extensionAlias,
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

      const assets = this.getAssetSources().reduce((acc, source) => {
         const asset = this.getAsset(source);
         if (!asset) return acc;
         acc[source] = asset.type == "text" ? asset.content : "";
         return acc;
      }, {} as Record<string, string>);

      const result = resolve(assets, source, opts);

      if (!result) {
         const isNodeModule = !isLocal(source) && !isUrl(source);
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
            } = parsePackageName(source);
            const version = this._dependencies[name] || _version;
            source = `${name}@${version}${subpath}`;
         }

         return resolve(assets, source, opts);
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
    * Adds or updates an asset.
    * @param source The source path of the asset.
    * @param content The content of the asset.
    * @returns The Asset object that was added/updated.
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

      // Virtual modules that depends on the asset should be flagged as modified
      for (const [_, virtual] of this._virtualAssets) {
         if (virtual.source.startsWith("virtual:" + asset.source)) {
            virtual.modified = true;
         }
      }

      this._trigger("onAddOrUpdateAsset", { asset });
      return asset as T;
   }

   /**
    * Returns an asset.
    * @param source The source file path of the asset.
    * @returns The Asset object if found, otherwise null.
    */
   public getAsset(source: string) {
      if (!source) return null;
      if (source.startsWith("virtual:")) {
         const asset = this._virtualAssets.get(source);
         if (asset) return asset;
      }

      source = path.join("/", source.split("?")[0]);
      return this._assets.get(source) || null;
   }

   /**
    * Removes all assets and clears the cache.
    */
   public clearAssets() {
      /**
       * Don't do this._assets.clear() because that won't revoke the
       * object urls of blobs.
       */
      [this._assets, this._virtualAssets].forEach((map) => {
         map.forEach((asset) => {
            this.removeAsset(asset.source);
         });
      });

      this.clearCache();
   }

   public clearCache() {
      this._cachedDeps.compiled.clear();
      this._cachedDeps.parsed.clear();
   }

   /**
    * Removes all assets that is located in the provided source.
    * @param source The source where all the assets will be removed.
    */
   public removeDirectory(source: string) {
      if (!source) return;
      if (source.startsWith("virtual:")) return;
      source = path.join("/", source);

      for (const [_, asset] of this._assets) {
         if (asset.source.startsWith(source) && asset.source != source) {
            this.removeAsset(asset.source);
         }
      }
   }

   /**
    * Removes an asset.
    * @param source The source of the asset to remove.
    */
   public removeAsset(source: string) {
      if (!source) return;
      const isVirtual = source.startsWith("virtual:");
      if (!isVirtual) {
         source = path.join("/", source);
      }

      const asset = isVirtual
         ? this._virtualAssets.get(source)
         : this._assets.get(source);
      if (!asset) return;

      if (asset.type == "resource" && asset.contentURL) {
         URL.revokeObjectURL(asset.contentURL);
      }

      if (isVirtual) {
         this._virtualAssets.delete(source);
      } else {
         this._assets.delete(source);
         this._trigger("onRemoveAsset", { asset });
      }

      // Remove from cache
      [this._cachedDeps.compiled, this._cachedDeps.parsed].forEach((map) => {
         map.forEach((item, key) => {
            if (!item.source || !item.importers) return;
            const isVirtual = item.source.startsWith("virtual:");
            const isUnused = Object.values(item.importers).length == 1;
            const isDependentChunk = !!item.importers[asset.source];
            const isDisposable = isVirtual && isUnused && isDependentChunk;
            if (item.source == asset.source || isDisposable) {
               map.delete(key);
               if (isVirtual) this.removeAsset(item.source);
            }
         });
      });
   }

   /**
    * Starts the bundling process.
    * @returns An object containing the bundle result.
    */
   public async run() {
      const timeBeforeGraph = performance.now();
      const graph = await getDependencyGraph.call(this);
      const timeAfterGraph = performance.now();
      console.log(graph);
      const timeBeforeBundle = performance.now();
      const result = await bundle.call(this, graph);
      const timeAfterBundle = performance.now();
      [this._assets, this._virtualAssets].forEach((assets) => {
         assets.forEach((asset) => {
            asset.modified = false;
         });
      });
      if (this._iframe && this._config.bundle.mode == "development") {
         this._iframe.srcdoc = result.html.content;
      }
      const totalGraphTime = Math.round(timeAfterGraph - timeBeforeGraph);
      const totalBundleTime = Math.round(timeAfterBundle - timeBeforeBundle);
      const message =
         `⏲ Graph  - ${totalGraphTime} ms\n` +
         `⏲ Bundle - ${totalBundleTime} ms\n` +
         `⏲ Total  - ${totalGraphTime + totalBundleTime} ms`;
      DEBUG.info(this._config.logLevel, console.info)?.(message);
      return result;
   }

   public get dependencies() {
      return this._dependencies as ReadonlyDeep<typeof this._dependencies>;
   }

   public get config() {
      return this._config as ReadonlyDeep<typeof this._config>;
   }
}

export default Toypack;
export * as Babel from "@babel/standalone";

interface Cache {
   parsed: Map<
      string,
      {
         source?: string;
         importers?: Importers;
         parsed?: ParsedScriptResult | ParsedStyleResult | null;
         loaded?: LoadChunkResult;
      }
   >;
   compiled: Map<
      string,
      {
         source?: string;
         importers?: Importers;
         content?: string;
         map?: EncodedSourceMap | null;
      }
   >;
}
