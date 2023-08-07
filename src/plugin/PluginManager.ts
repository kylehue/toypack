import { SpecifierOptions } from "src/utils/get-import-code.js";
import { Importers } from "../parse/index.js";
import Toypack from "../Toypack.js";
import { DependencyGraph, Plugin } from "../types";
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
   private _pluginsCache = new Map<Plugin, Map<any, any>>();

   constructor(private bundler: Toypack) {}

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
      const baseContext: PluginContextBase = {
         bundler: this.bundler,
         cache: this._pluginsCache.get(plugin)!,
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
      };

      if (fullContext?.source && fullContext?.importers && fullContext?.graph) {
         const shouldMap = shouldProduceSourceMap(
            fullContext.source,
            this.bundler.config.bundle.sourceMap
         );
         const _fullContext: PluginContext = {
            ...baseContext,
            graph: fullContext.graph,
            getImporters: () => fullContext.importers,
            getCurrentImporter: () => {
               const importersArr = Object.values(
                  Object.fromEntries(fullContext.importers)
               );
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

   public clearCache() {
      for (const [_, map] of this._pluginsCache) {
         map.clear();
      }
   }

   public hasPlugin(plugin: Plugin) {
      return this._pluginsCache.has(plugin);
   }

   public registerPlugin<T extends Plugin>(plugin: T) {
      this._pluginsCache.set(plugin, new Map());

      plugin.setup?.call(this._createContext(plugin));

      for (const prop in plugin) {
         if (prop == "name" || prop == "extensions" || prop == "setup") {
            continue;
         }

         const hookName = prop as keyof PluginHooks;
         this._registerHook(plugin, hookName, plugin[hookName]);
      }
   }

   public removePlugin(plugin: Plugin) {
      const removeFromHook = (hookName: keyof typeof this._hooks) => {
         for (let i = 0; i < (this._hooks[hookName]?.length || 0); i++) {
            const hook = this._hooks[hookName]![i];
            if (hook.plugin === plugin) {
               this._hooks[hookName]?.splice(i, 1);
               break;
            }
         }
      };

      for (const hookName in this._hooks) {
         removeFromHook(hookName as keyof typeof this._hooks);
      }

      this._pluginsCache.delete(plugin);
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
