import { SpecifierOptions } from "src/utils/get-import-code.js";
import { Importers } from "../parse/index.js";
import Toypack from "../Toypack.js";
import {
   DependencyGraph,
   Loader,
   LoadResult,
   ModuleInfo,
   Plugin,
} from "../types";
import {
   getImportCode,
   getUsableResourcePath,
   ERRORS,
   shouldProduceSourceMap,
} from "../utils";
import {
   ConfigurableHook,
   PluginContext,
   PluginContextBase,
   PluginHooks,
} from "./hook-types.js";
import { loadChunk } from "../parse/load-chunk.js";

type PluginHooksGroupMap = {
   [key in keyof PluginHooks]?: {
      plugin: Plugin;
      hook: PluginHooks[key];
   }[];
};

interface FullContext {
   graph: DependencyGraph;
   importers: Importers;
   source: string;
}

type TriggerOptions<
   HookName extends keyof PluginHooks,
   Hook extends PluginHooks[HookName],
   HookFunction extends Hook extends ConfigurableHook ? Hook["handler"] : Hook,
   HookReturn extends Awaited<ReturnType<HookFunction>>,
   Callback = (result: Exclude<HookReturn, undefined | null | void>) => void
> = {
   name: HookName;
   args: Parameters<HookFunction> | (() => Parameters<HookFunction>);
} & (ThisParameterType<HookFunction> extends PluginContext
   ? { context: FullContext }
   : { context?: never }) &
   (HookReturn extends void
      ? {
           callback?: Callback;
        }
      : {
           callback: Callback;
        });

export class PluginManager {
   private _hooks: PluginHooksGroupMap = {};
   private _loaders: { plugin: Plugin; loader: Loader }[] = [];
   private _cache = new Map<
      string,
      {
         formattedKey: string;
         originalKey: string;
         value: any;
         plugin: Plugin;
      }
   >();

   constructor(private bundler: Toypack) {}

   private _getLoadersFor(source: string) {
      const result: typeof this._loaders = [];
      for (const { loader, plugin } of this._loaders) {
         let hasMatched = false;
         if (typeof loader.test == "function" && loader.test(source)) {
            hasMatched = true;
         } else if (
            loader.test instanceof RegExp &&
            loader.test.test(source.split("?")[0])
         ) {
            hasMatched = true;
         }

         if (hasMatched) {
            result.push({ loader, plugin });
            if (loader.disableChaining === true) break;
         }
      }

      return result;
   }

   private _registerHook<HookName extends keyof PluginHooks>(
      plugin: Plugin,
      hookName: HookName,
      hookFunction?: PluginHooks[HookName]
   ) {
      if (!hookFunction) return;
      let hookGroup = this._hooks[hookName];
      if (!hookGroup) {
         hookGroup = [];
         this._hooks[hookName] = hookGroup;
      }

      hookGroup.push({
         plugin,
         hook: hookFunction,
      });

      // Sort hooks by configuration
      hookGroup.splice(
         0,
         hookGroup.length,
         ...hookGroup.sort(({ hook: a }, { hook: b }) => {
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

            return 0;
         })
      );
   }

   private _createContext<T extends FullContext>(
      plugin: Plugin,
      fullContext?: T
   ): T extends FullContext ? PluginContext : PluginContextBase {
      const createCacheKey = (str: string, isConfigConstrained?: boolean) => {
         const common = `${plugin.name}.${str}`;
         if (isConfigConstrained) {
            // @ts-ignore
            return `${this.bundler._configHash}.${common}`;
         }

         return common;
      };

      const baseContext: PluginContextBase = {
         bundler: this.bundler,
         getUsableResourcePath(source: string, baseDir = ".") {
            return getUsableResourcePath(this.bundler, source, baseDir);
         },
         getImportCode(
            request: string,
            specifiers?: (SpecifierOptions | string)[]
         ) {
            return getImportCode(request, specifiers);
         },
         getDefaultExportCode(exportCode: string) {
            return `export default ${exportCode};`;
         },
         emitError: (message) => {
            // @ts-ignore
            this.bundler._pushToDebugger(
               "error",
               ERRORS.plugin(plugin.name, message)
            );
         },
         emitWarning: (message) => {
            // @ts-ignore
            this.bundler._pushToDebugger(
               "warning",
               `[${plugin.name}] Warning: ` + message
            );
         },
         emitInfo: (message) => {
            // @ts-ignore
            this.bundler._pushToDebugger(
               "info",
               `[${plugin.name}]: ` + message
            );
         },
         getCache: (key, isConfigDependent) => {
            key = createCacheKey(key, isConfigDependent);
            const cache = this._cache.get(key);
            if (cache?.plugin === plugin) {
               return cache.value;
            }
         },
         removeCache: (key, isConfigDependent) => {
            key = createCacheKey(key, isConfigDependent);
            const cache = this._cache.get(key);
            if (cache?.plugin === plugin) {
               this._cache.delete(key);
            }
         },
         setCache: (key, value, isConfigDependent) => {
            const formattedKey = createCacheKey(key, isConfigDependent);
            this._cache.set(formattedKey, {
               originalKey: key,
               formattedKey,
               value,
               plugin,
            });
            return value;
         },
         eachCache: (callback) => {
            this._cache.forEach((value) => {
               if (value.plugin !== plugin) return;
               callback(value.value, value.originalKey);
            });
         },
      };

      if (fullContext?.source && fullContext?.importers && fullContext?.graph) {
         const shouldMap = shouldProduceSourceMap(
            fullContext.source,
            this.bundler.getConfig().bundle.sourceMap
         );
         const _fullContext: PluginContext = {
            ...baseContext,
            graph: fullContext.graph,
            getImporters: () => fullContext.importers,
            getCurrentImporter: () => {
               const importersArr = Object.values(fullContext.importers);
               return importersArr[importersArr.length - 1];
            },
            shouldMap: () => {
               return shouldMap;
            },
            load: async (source: string) => {
               // @ts-ignore
               const cached = this.bundler._getCache("parsed", source);
               const result = cached?.loaded
                  ? cached.loaded
                  : await loadChunk.call(
                       this.bundler,
                       source,
                       false,
                       fullContext.graph,
                       fullContext.importers
                    );

               // @ts-ignore
               this.bundler._setCache("parsed", source, {
                  loaded: result,
               });

               return result;
            },
         };

         return _fullContext;
      }

      return baseContext as PluginContext;
   }

   public registerPlugin<T extends Plugin>(plugin: T) {
      for (const loader of plugin.loaders || []) {
         this._loaders.push({ loader, plugin });
      }

      plugin.setup?.call(this._createContext(plugin));

      for (const prop in plugin) {
         if (
            prop == "name" ||
            prop == "extensions" ||
            prop == "loaders" ||
            prop == "setup"
         ) {
            continue;
         }

         const hookName = prop as keyof PluginHooks;
         this._registerHook(plugin, hookName, plugin[hookName]);
      }
   }

   public removePlugin(plugin: string | Plugin) {
      const isMatch = (_plugin: Plugin) =>
         typeof plugin == "string"
            ? _plugin.name === plugin
            : _plugin === plugin;
      const removeFromHook = (hookName: keyof typeof this._hooks) => {
         for (let i = 0; i < (this._hooks[hookName]?.length || 0); i++) {
            const hook = this._hooks[hookName]![i];
            if (isMatch(hook.plugin)) {
               this._hooks[hookName]?.splice;
               break;
            }
         }
      }

      for (const hookName in this._hooks) {
         removeFromHook(hookName as keyof typeof this._hooks);
      }

      for (let i = 0; i < this._loaders.length; i++) {
         const loader = this._loaders[i];
         if (!isMatch(loader.plugin)) continue;
         this._loaders.splice(i, 1);
      }

      for (const [key, cache] of this._cache) {
         if (!isMatch(cache.plugin)) continue;
         this._cache.delete(key);
      }
   }

   public async useLoaders(
      source: string,
      graph: DependencyGraph,
      importers: Importers,
      moduleInfo: ModuleInfo,
      callback: (loadResult: string | LoadResult) => void
   ) {
      const loaders = this._getLoadersFor(source);
      for (const { loader, plugin } of loaders) {
         const context = this._createContext(plugin, {
            graph,
            importers,
            source,
         });

         let loaderResult;
         const compile = loader.compile;
         if (typeof compile == "function") {
            loaderResult = compile.call(context, moduleInfo);
         } else {
            if (compile.async) {
               loaderResult = await compile.handler.call(context, moduleInfo);
            } else {
               loaderResult = compile.handler.call(context, moduleInfo);
            }
         }

         if (!loaderResult) continue;
         callback(loaderResult);
      }
   }

   public async triggerHook<
      T extends keyof PluginHooks,
      H extends PluginHooks[T],
      K extends H extends ConfigurableHook ? H["handler"] : H,
      R extends Awaited<ReturnType<K>>
   >({ name, args: rawArgs, context, callback }: TriggerOptions<T, H, K, R>) {
      const hookGroup = this._hooks[name];
      if (!hookGroup) return;
      for (const { hook, plugin } of hookGroup) {
         const ctx = this._createContext(plugin, context);
         const args = typeof rawArgs == "function" ? rawArgs() : rawArgs;
         let result: R;
         if (typeof hook == "function") {
            result = (hook as any).apply(ctx, args);
         } else {
            if (hook.async === true) {
               result = await (hook.handler as any).apply(ctx, args);
            } else {
               result = (hook.handler as any).apply(ctx, args);
            }
         }
         if (typeof callback == "function" && result) {
            (callback as any)(result);
            if (typeof hook == "object" && hook.chaining === false) {
               break;
            }
         }
      }
   }
}
