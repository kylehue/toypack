import { SpecifierOptions } from "src/utils/get-import-code.js";
import { Importers } from "../graph/index.js";
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
   DEBUG,
   ERRORS,
   shouldProduceSourceMap,
} from "../utils";
import {
   BuildHookConfig,
   BuildHookContext,
   BuildHookContextBase,
   BuildHooks,
} from "./hook-types.js";
import { loadChunk } from "../graph/load-chunk.js";

type BuildHooksGroupMap = {
   [key in keyof BuildHooks]?: {
      plugin: Plugin;
      hook: BuildHooks[key];
   }[];
};

export type PartialContext<
   T extends BuildHookContext | BuildHookContextBase = BuildHookContextBase
> = {
   bundler: Toypack;
} & (T extends BuildHookContext
   ? {
        graph: DependencyGraph;
        importers: Importers;
        source: string;
     }
   : {});

type TriggerOptions<
   HookName extends keyof BuildHooks,
   Hook extends BuildHooks[HookName],
   HookFunction extends Hook extends BuildHookConfig ? Hook["handler"] : Hook,
   HookReturn extends Awaited<ReturnType<HookFunction>>,
   Callback = (result: Exclude<HookReturn, undefined | null | void>) => void
> = {
   name: HookName;
   args: Parameters<HookFunction> | (() => Parameters<HookFunction>);
} & (ThisParameterType<HookFunction> extends BuildHookContextBase
   ? { context: PartialContext<ThisParameterType<HookFunction>> }
   : { context?: never }) &
   (HookReturn extends void
      ? {
           callback?: Callback;
        }
      : {
           callback: Callback;
        });

export class PluginManager {
   private _hooks: BuildHooksGroupMap = {};
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

   private _registerHook<HookName extends keyof BuildHooks>(
      plugin: Plugin,
      hookName: HookName,
      hookFunction?: BuildHooks[HookName]
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

   private _createContext<T extends BuildHookContext | BuildHookContextBase>(
      partialContext: PartialContext<T>,
      plugin: Plugin
   ): T {
      const createCacheKey = (str: string, isConfigConstrained?: boolean) => {
         const common = `${plugin.name}.${str}`;
         if (isConfigConstrained) {
            // @ts-ignore
            return `${this.bundler._configHash}.${common}`;
         }

         return common;
      };

      const baseContext: BuildHookContextBase = {
         bundler: partialContext.bundler,
         getUsableResourcePath(source: string, baseDir = ".") {
            return getUsableResourcePath(this.bundler, source, baseDir);
         },
         getImportCode(
            request: string,
            specifiers?: (SpecifierOptions | string)[]
         ) {
            return getImportCode(
               this.bundler.config.bundle.moduleType,
               request,
               specifiers
            );
         },
         getDefaultExportCode(exportCode: string) {
            const config = this.bundler.getConfig();
            if (config.bundle.moduleType == "esm") {
               return `export default ${exportCode};`;
            } else {
               return `module.exports = ${exportCode};`;
            }
         },
         emitError: (message) => {
            // @ts-ignore
            this.bundler._trigger(
               "onError",
               ERRORS.plugin(plugin.name, message)
            );
         },
         emitWarning: (message) => {
            const logLevel = partialContext.bundler.getConfig().logLevel;
            DEBUG.warn(
               logLevel,
               console.warn
            )?.(`[${plugin.name}] Warning: ` + message);
         },
         emitInfo: (message) => {
            const logLevel = partialContext.bundler.getConfig().logLevel;
            DEBUG.warn(
               logLevel,
               console.info
            )?.(`[${plugin.name}]: ` + message);
         },
         getCache: (key, isConfigDependent) => {
            key = createCacheKey(key, isConfigDependent);
            return this._cache.get(key)?.value;
         },
         removeCache: (key, isConfigDependent) => {
            key = createCacheKey(key, isConfigDependent);
            this._cache.delete(key);
         },
         setCache: (key, value, isConfigDependent) => {
            const formattedKey = createCacheKey(key, isConfigDependent);
            this._cache.set(formattedKey, {
               originalKey: key,
               formattedKey,
               value,
               plugin
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

      const ctx = partialContext as PartialContext<BuildHookContext>;
      if (ctx.source && ctx.importers && ctx.graph) {
         const shouldMap = shouldProduceSourceMap(
            ctx.source,
            this.bundler.getConfig().bundle.sourceMap
         );
         const fullContext: BuildHookContext = {
            ...baseContext,
            getImporters: () => ctx.importers,
            // last importer is guaranteed to be defined
            getCurrentImporter: () => Object.values(ctx.importers).pop()!,
            shouldMap: () => {
               return shouldMap;
            },
            load: async (source: string) => {
               // @ts-ignore
               const cached = this.bundler._getCache("parsed", source);
               const result = cached?.loaded
                  ? cached.loaded
                  : await loadChunk.call(this.bundler, source, false, {
                       bundler: this.bundler,
                       graph: ctx.graph,
                       importers: ctx.importers,
                       source,
                    });

               // @ts-ignore
               this.bundler._setCache("parsed", source, {
                  loaded: result,
               });

               return result;
            },
         };

         return fullContext as T;
      }

      return baseContext as T;
   }

   public registerPlugin<T extends Plugin>(plugin: T) {
      for (const loader of plugin.loaders || []) {
         this._loaders.push({ loader, plugin });
      }

      plugin.setup?.call(
         this._createContext(
            {
               bundler: this.bundler,
            },
            plugin
         )
      );

      for (const prop in plugin) {
         if (
            prop == "name" ||
            prop == "extensions" ||
            prop == "loaders" ||
            prop == "setup"
         ) {
            continue;
         }

         const hookName = prop as keyof BuildHooks;
         this._registerHook(plugin, hookName, plugin[hookName]);
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
         const context = this._createContext<BuildHookContext>(
            {
               bundler: this.bundler,
               graph,
               importers,
               source,
            },
            plugin
         );

         const loaderResult =
            typeof loader.compile == "function"
               ? loader.compile.call(context, moduleInfo)
               : loader.compile.async === true
               ? await loader.compile.handler.call(context, moduleInfo)
               : loader.compile.handler.call(context, moduleInfo);
         if (!loaderResult) continue;
         callback(loaderResult);
      }
   }

   public async triggerHook<
      T extends keyof BuildHooks,
      H extends BuildHooks[T],
      K extends H extends BuildHookConfig ? H["handler"] : H,
      R extends Awaited<ReturnType<K>>
   >({ name, args: rawArgs, context, callback }: TriggerOptions<T, H, K, R>) {
      const hookGroup = this._hooks[name];
      if (!hookGroup) return;
      for (const { hook, plugin } of hookGroup) {
         const ctx = context ? this._createContext(context, plugin) : null;
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
            if (typeof hook != "function" && hook.chaining === false) {
               break;
            }
         }
      }
   }
}
