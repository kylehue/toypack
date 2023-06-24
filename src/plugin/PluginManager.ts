import Toypack from "../Toypack.js";
import { DependencyGraph, Plugin } from "../types";
import {
   parseURL,
   getUsableResourcePath,
   error,
   info,
   warn,
   anyError,
   pluginError,
} from "../utils";
import { BuildHookConfig, BuildHookContext, BuildHooks } from "./hook-types.js";

type PluginData = ReturnType<Plugin>;
type BuildHooksGroupMap = {
   [key in keyof BuildHooks]?: {
      plugin: PluginData;
      hook: BuildHooks[key];
   }[];
};

export interface PartialContext {
   bundler: Toypack;
   graph: DependencyGraph;
   importer: string | undefined;
}

type TriggerOptions<
   HookName extends keyof BuildHooks,
   Hook extends BuildHooks[HookName],
   HookFunction extends Hook extends BuildHookConfig ? Hook["handler"] : Hook,
   HookReturn extends Awaited<ReturnType<HookFunction>>,
   Callback = (result: Exclude<HookReturn, undefined | null | void>) => void
> = {
   name: HookName;
   args: Parameters<HookFunction> | (() => Parameters<HookFunction>);
} & (ThisParameterType<HookFunction> extends BuildHookContext
   ? { context: PartialContext }
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

   constructor(private bundler: Toypack) {}

   public registerPlugin<T extends PluginData>(plugin: T) {
      for (const prop in plugin) {
         if (prop == "name" || prop == "extensions" || prop == "loader") {
            continue;
         }

         const hookName = prop as keyof BuildHooks;
         this._registerHook(plugin, hookName, plugin[hookName]);
      }
   }

   private _registerHook<HookName extends keyof BuildHooks>(
      plugin: PluginData,
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

   public createContext(partialContext: PartialContext, plugin: PluginData) {
      const result: BuildHookContext = {
         bundler: partialContext.bundler,
         getImporter: () =>
            partialContext.importer
               ? partialContext.graph[partialContext.importer]
               : null,
         getUsableResourcePath: (source: string, baseDir = ".") => {
            return getUsableResourcePath(
               partialContext.bundler,
               source,
               baseDir
            );
         },
         parseSource: parseURL,
         error: (message) => {
            const logLevel = partialContext.bundler.getConfig().logLevel;
            if (logLevel == "error") {
               // @ts-ignore
               this.bundler._trigger(
                  "onError",
                  pluginError(plugin.name, message)
               );
            }
         },
         warn: (message) => {
            const logLevel = partialContext.bundler.getConfig().logLevel;
            warn(logLevel, `[${plugin.name}] Warning: ` + message);
         },
         info: (message) => {
            const logLevel = partialContext.bundler.getConfig().logLevel;
            info(logLevel, `[${plugin.name}]: ` + message);
         },
      };

      return result;
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
         const ctx = context ? this.createContext(context, plugin) : null;
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
