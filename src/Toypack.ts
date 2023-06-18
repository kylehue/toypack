import path from "path-browserify";
import { RawSourceMap } from "source-map-js";
import { PartialDeep, Asyncify, ReadonlyDeep } from "type-fest";
import { IAsset, createAsset } from "./asset.js";
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
import jsonPlugin from "./plugins/jsonPlugin.js";
import htmlPlugin from "./plugins/htmlPlugin.js";
import rawPlugin from "./plugins/rawPlugin.js";
import { invalidAssetSourceError } from "./errors.js";
import { CssNode } from "css-tree";
import { BuildHookConfig, BuildHooks, Plugin } from "./buildHooks.js";

export class Toypack {
   private _iframe: HTMLIFrameElement | null = null;
   private _extensions = {
      resource: [...resourceExtensions],
      style: [...styleExtensions],
      script: [...appExtensions],
   };
   private _assets: Map<string, IAsset> = new Map();
   private _config: IToypackConfig = JSON.parse(JSON.stringify(defaultConfig));
   protected _buildHooks: { [key in keyof BuildHooks]?: BuildHooks[key][] } =
      {};
   //protected _loaders: ILoaderData[] = [];
   protected _cachedDeps: ICache = {
      parsed: new Map(),
      compiled: new Map(),
   };
   public hooks = new Hooks();
   constructor(config?: PartialDeep<IToypackConfig>) {
      if (config) this.setConfig(config);

      this.usePlugin(htmlPlugin(), rawPlugin(), jsonPlugin());

      if (this._config.logLevel == "error") {
         this.hooks.onError((error) => {
            console.error(error.reason);
         });
      }
   }

   public setConfig(config: PartialDeep<IToypackConfig>) {
      this.clearCache();
      this._config = mergeDeep(this._config, config as IToypackConfig);
   }

   public getConfig(): ReadonlyDeep<IToypackConfig> {
      return this._config;
   }

   protected warn(message: string) {
      if (this._config.logLevel == "error" || this._config.logLevel == "warn") {
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

      source = source.split("?")[0];
      const extension = path.extname(source);
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
      if (this._config.bundle.mode == "production") {
         return "./" + getHash(asset.source) + path.extname(asset.source);
      } else {
         return asset.contentURL;
      }
   }

   /**
    * Adds a plugin to Toypack.
    */
   public usePlugin<T extends ReturnType<Plugin>>(...plugins: T[]) {
      const registerBuildHook = <HookName extends keyof BuildHooks>(
         hookName: HookName,
         hookFunction?: BuildHooks[HookName]
      ) => {
         if (!hookFunction) return;
         let hookGroup = this._buildHooks[hookName];
         if (!hookGroup) {
            hookGroup = [];
            this._buildHooks[hookName] = hookGroup;
         }

         hookGroup.push(hookFunction);

         /**
          * Sort plugins
          * If chaining is set to false, it should always be first no matter
          * what the order is.
          * If order is set to "pre", it should be first.
          * If order is set to "post", it should be last.
          */
         hookGroup.splice(
            0,
            hookGroup.length,
            ...hookGroup.sort((a, b) => {
               // Sort based on the "chaining" property
               if (typeof a === "object" && a.chaining === false) {
                  return -1;
               } else if (typeof b === "object" && b.chaining === false) {
                  return 1;
               }

               // Sort objects with "order: pre" first
               if (typeof a === "object" && a.order === "pre") {
                  return -1;
               } else if (typeof b === "object" && b.order === "pre") {
                  return 1;
               }

               // Sort objects with "order: post" last
               if (typeof a === "object" && a.order === "post") {
                  return 1;
               } else if (typeof b === "object" && b.order === "post") {
                  return -1;
               }

               // No specific ordering criteria, maintain original order
               return 0;
            })
         );
      };

      // Register build hooks
      for (let i = 0; i < plugins.length; i++) {
         const plugin = plugins[i];
         registerBuildHook("load", plugin.load);
         registerBuildHook("transform", plugin.transform);
      }
   }

   protected async _triggerBuildHook<
      HookName extends keyof BuildHooks,
      Hook extends BuildHooks[HookName]
   >(
      hookName: HookName,
      callback: (
         result: NonNullable<
            Awaited<
               ReturnType<Hook extends BuildHookConfig ? Hook["handler"] : Hook>
            >
         >
      ) => void | Parameters<
         Hook extends BuildHookConfig ? Hook["handler"] : Hook
      >,
      args: Parameters<Hook extends BuildHookConfig ? Hook["handler"] : Hook>
   ) {
      const hookGroup = this._buildHooks[hookName];
      if (!hookGroup) return;
      for (const hook of hookGroup) {
         let result;
         if (typeof hook == "function") {
            result = (hook as any).apply(null, args);
         } else {
            if (hook.async === true) {
               result = await (hook.handler as any).apply(null, args);
            } else {
               result = (hook.handler as any).apply(null, args);
            }
         }

         if (result) {
            args = callback(result) || args;

            if (typeof hook != "function" && hook.chaining === false) {
               break;
            }
         }
      }
   }

   /**
    * Resolves a relative source path.
    * @param {string} relativeSource The relative source path to resolve.
    * @param {Partial<IResolveOptions>} [options] Optional resolve options.
    * @returns {string} The resolved absolute path.
    */
   public resolve(relativeSource: string, options?: Partial<IResolveOptions>) {
      const opts = Object.assign(
         {
            aliases: this._config.bundle.resolve.alias,
            fallbacks: this._config.bundle.resolve.fallback,
            extensions: this._config.bundle.resolve.extensions,
         } as IResolveOptions,
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
      console.log(this._buildHooks.load);
      
      console.log(await getDependencyGraph.call(this));
      // const oldMode = this._config.bundle.mode;
      // this._config.bundle.mode = isProd ? "production" : oldMode;
      // const graph = await getDependencyGraph.call(this);
      // console.log(graph);
      // const result = await bundle.call(this, graph);
      // this._config.bundle.mode = oldMode;

      // // Set modified flag to false for all assets except those in node_modules
      // this._assets.forEach((asset) => {
      //    if (isNodeModule(asset.source) || asset.type == "resource") return;
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
export { CodeComposer } from "./CodeComposer.js";
export type { IToypackConfig, IAsset };

interface ICache {
   parsed: Map<
      string,
      {
         asset: IAsset;
         parsed: any;
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
