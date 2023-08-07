import path from "path-browserify";
import { PartialDeep, ReadonlyDeep } from "type-fest";
import htmlPlugin from "./build-plugins/html-plugin.js";
import jsonPlugin from "./build-plugins/json-plugin.js";
import rawPlugin from "./build-plugins/raw-plugin.js";
import importUrlPlugin from "./build-plugins/import-url-plugin.js";
import importMetaPlugin from "./build-plugins/import-meta-plugin.js";
import bundleDepsPlugin from "./build-plugins/bundle-deps-plugin.js";
import autoDepsPlugin from "./build-plugins/auto-deps-plugin.js";
import { bundle } from "./bundle/index.js";
import { ToypackConfig, defaultConfig } from "./config.js";
import { Importers, getDependencyGraph } from "./parse/index.js";
import { Hooks } from "./Hooks.js";
import { PluginManager } from "./plugin/PluginManager.js";
import type {
   Asset,
   ResolveOptions,
   Plugin,
   TextAsset,
   Error,
   ScriptModule,
} from "./types";
import {
   ERRORS,
   EXTENSIONS,
   getHash,
   isLocal,
   isUrl,
   isValidAssetSource,
   parsePackageName,
} from "./utils";
import { createAsset } from "./utils/create-asset.js";
import { resolve } from "./utils/resolve.js";
import { LoadChunkResult } from "./parse/load-chunk.js";
import { ParsedScriptResult } from "./parse/parse-script-chunk.js";
import { ParsedStyleResult } from "./parse/parse-style-chunk.js";
import { PackageProvider, getPackage } from "./package-manager/index.js";
import { EncodedSourceMap } from "@jridgewell/gen-mapping";
import { cloneDeep, merge, mergeWith, union } from "lodash-es";
import { UidTracker } from "./utils/UidTracker.js";
import { UidGenerator } from "./utils/UidGenerator.js";

let _lastId = 0;
export class Toypack extends Hooks {
   public readonly id = `$${_lastId++}`;
   private _iframe: HTMLIFrameElement | null = null;
   private _extensions = {
      resource: [...EXTENSIONS.resource],
      style: [...EXTENSIONS.style],
      script: [...EXTENSIONS.script],
   };
   private _assets = new Map<string, Asset>();
   private _config: ToypackConfig = cloneDeep(defaultConfig);
   private _configHash = { last: "", current: "" };
   private _packageProviders: PackageProvider[] = [];
   private _dependencies: Record<string, string> = {};
   private _cachedDeps = new Map<string, Cache>();
   private _debugger = {
      error: [] as Error[],
      warning: [] as string[],
      info: [] as string[],
      verbose: [] as string[],
   };
   protected _uidTracker = new UidTracker();
   protected _uidGenerator = new UidGenerator();
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
         importUrlPlugin(),
         importMetaPlugin(),
         bundleDepsPlugin(),
         autoDepsPlugin()
      );

      this.usePackageProvider({
         host: "esm.sh",
         dtsHeader: "X-Typescript-Types",
         queryParams: {
            dev: this._config.bundle.mode === "development",
         },
      });

      this.usePackageProvider({
         host: "cdn.jsdelivr.net",
         postpath: ({ subpath }) => {
            if (!/\.css$/.test(subpath)) return "+esm";
         },
         prepath: "npm",
      });
   }

   protected _pushToDebugger<T extends keyof typeof this._debugger>(
      type: T,
      data: T extends "error" ? Error : string
   ) {
      this._debugger[type].push(data as any);
   }

   protected _getCache(source: string) {
      return this._cachedDeps.get(source) || null;
   }

   protected _setCache(source: string, value: Partial<Cache>) {
      const cached = this._getCache(source);
      value.source = source;
      if (cached) {
         Object.assign(cached || {}, value);
      } else {
         this._cachedDeps.set(source, value);
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

   private _getConfigHash() {
      const config: any = cloneDeep(this._config);
      /**
       * Ignore configs that doesn't require assets to recompile
       * when changed.
       */
      config.bundle.template = null;
      config.bundle.importMap = null;
      config.bundle.sourceMap = null;
      config.logLevel = null;
      return getHash(JSON.stringify(config));
   }

   public getPackageProviders() {
      return this._packageProviders;
   }

   /**
    * Installs a package from providers.
    * @param source The source of the package to install.
    * @param version The version of the package to install. Defaults to
    * latest.
    * @returns The installed package.
    */
   public async installPackage(source: string, version = "latest") {
      const pkg = await getPackage.call(this, source, version);
      if (!pkg.assets.length) return pkg;

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

         // asset.forceContentTypeAs ||=
         //    pkgAsset.type != "resource" ? pkgAsset.type : undefined;

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

      return pkg;
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
         if (this.config.plugins.includes(plugin)) continue;
         if (this._pluginManager.hasPlugin(plugin)) continue;
         this._pluginManager.registerPlugin(plugin);

         for (const ext of plugin.extensions || []) {
            if (!this._hasExtension(ext[0], ext[1])) {
               this._extensions[ext[0]].push(ext[1]);
            }
         }

         this.config.plugins.push(plugin);
      }
   }

   /**
    * Removes a plugin.
    *
    * Note: This won't remove the extensions that was added by the plugin.
    */
   public removePlugin(plugin: Plugin) {
      this._pluginManager.removePlugin(plugin);
      this.config.plugins.splice(this.config.plugins.indexOf(plugin), 1);
   }

   public setConfig(config: PartialDeep<ToypackConfig>) {
      const customizer = (objValue: any, srcValue: any) => {
         if (Array.isArray(objValue) && Array.isArray(srcValue)) {
            return union(objValue, srcValue);
         }
      };

      const _config = this._config;
      // basic types
      _config.bundle.mode = config.bundle?.mode ?? _config.bundle.mode;
      _config.bundle.entry = config.bundle?.entry ?? _config.bundle.entry;
      _config.bundle.format = config.bundle?.format ?? _config.bundle.format;
      _config.logLevel = config.logLevel ?? _config.logLevel;

      // config.bundle.resolve
      mergeWith(_config.bundle.resolve, config.bundle?.resolve, customizer);

      // config.bundle.sourceMap
      if (
         typeof _config.bundle?.sourceMap == "object" &&
         typeof config.bundle?.sourceMap == "object"
      ) {
         mergeWith(
            _config.bundle.sourceMap,
            config.bundle?.sourceMap,
            customizer
         );
      } else {
         _config.bundle.sourceMap =
            config.bundle?.sourceMap ?? _config.bundle.sourceMap;
      }

      // config.bundle.importMap
      mergeWith(_config.bundle.importMap, config.bundle?.importMap, customizer);

      // config.bundle.template
      // not using `mergeWith` because the template arrays should
      // be allowed to contain duplicates
      merge(_config.bundle.template, config.bundle?.template);

      // config.parser
      mergeWith(_config.parser, config.parser);

      // config.packageManager
      mergeWith(_config.packageManager, config.packageManager);

      // config.plugins
      for (const plugin of config.plugins || []) {
         this.usePlugin(plugin);
      }

      this._configHash.current = this._getConfigHash();
   }

   public resetConfig() {
      this._config = cloneDeep(defaultConfig);
      this._configHash.current = this._getConfigHash();
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
            baseDir: ".",
         } as ResolveOptions,
         options || {}
      );

      if (opts.baseDir.startsWith("virtual:")) {
         opts.baseDir = opts.baseDir.replace("virtual:", "");
      }

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

      let result = resolve(assets, source, opts);

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

         result = resolve(assets, source, opts);
      }

      return result;
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
         this._pushToDebugger("error", ERRORS.invalidAssetSource(source));
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

      this._trigger("onAddOrUpdateAsset", asset);
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
      this._cachedDeps.clear();
      this._uidGenerator.reset();
      this._uidTracker.reset();
      this._pluginManager.clearCache();
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
      }

      // Remove from cache
      this._cachedDeps.forEach((item, key, map) => {
         if (!item.source || !item.importers) return;
         const isVirtual = item.source.startsWith("virtual:");
         const isUnused =
            Object.values(Object.fromEntries(item.importers)).length == 1;
         const isDependentChunk = item.importers.has(asset.source);
         const isDisposable = isVirtual && isUnused && isDependentChunk;
         if (item.source == asset.source || isDisposable) {
            map.delete(key);
            if (isVirtual) this.removeAsset(item.source);
         }
      });

      this._trigger("onRemoveAsset", asset);
   }

   private _clearDebugger() {
      this._debugger.error = [];
      this._debugger.info = [];
      this._debugger.warning = [];
      this._debugger.verbose = [];
   }

   /**
    * Starts the bundling process.
    * @returns An object containing the bundle result.
    */
   public async run() {
      this._clearDebugger();
      // Forget everything if config has changed
      if (this._configHash.last !== this._configHash.current) {
         this._pushToDebugger("info", "Config has changed. Clearing cache.");
         this.clearCache();
      }
      this._configHash.current = this._configHash.last = this._getConfigHash();
      const timeBeforeGraph = performance.now();
      const graph = await getDependencyGraph.call(this);
      const timeAfterGraph = performance.now();
      console.log(graph);
      const timeBeforeBundle = performance.now();
      const result = await bundle.call(this, graph);
      const timeAfterBundle = performance.now();
      if (this._iframe && this._config.bundle.mode == "development") {
         this._iframe.srcdoc = result.html.content;
      }

      // Log debug stuff
      const totalGraphTime = Math.round(timeAfterGraph - timeBeforeGraph);
      const totalBundleTime = Math.round(timeAfterBundle - timeBeforeBundle);
      const message =
         `⏲ Graph  - ${totalGraphTime} ms\n` +
         `⏲ Bundle - ${totalBundleTime} ms\n` +
         `⏲ Total  - ${totalGraphTime + totalBundleTime} ms`;
      this._pushToDebugger("info", message);

      const logLevel = this._config.logLevel;

      const error = this._debugger.error[0];
      if (error) {
         this._trigger("onError", error);
         if (
            logLevel == "error" ||
            logLevel == "warn" ||
            logLevel == "info" ||
            logLevel == "verbose"
         ) {
            console.error(error.reason);
         }
      }

      if (logLevel == "warn" || logLevel == "info" || logLevel == "verbose") {
         for (const warning of this._debugger.warning) {
            console.warn(warning);
         }
      }

      if (logLevel == "info" || logLevel == "verbose") {
         for (const info of this._debugger.info) {
            console.info(info);
         }
      }

      if (logLevel == "verbose") {
         for (const verbose of this._debugger.verbose) {
            console.info(verbose);
         }
      }

      //
      [this._assets, this._virtualAssets].forEach((assets) => {
         assets.forEach((asset) => {
            asset.modified = false;
         });
      });

      return result;
   }

   public get dependencies(): Readonly<Record<string, string>> {
      return this._dependencies;
   }

   public get config(): Readonly<ToypackConfig> {
      return this._config;
   }
}

export default Toypack;

interface Cache {
   source?: string;
   importers?: Importers;
   parsed?: ParsedScriptResult | ParsedStyleResult | null;
   loaded?: LoadChunkResult;
   content?: string;
   map?: EncodedSourceMap | null;
   module?: ScriptModule;
}
