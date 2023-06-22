import Toypack from "../Toypack.js";
import { DependencyGraph, Plugin } from "../types";
import { parseURL, getUsableResourcePath, error, info, warn } from "../utils";
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

   private _createContext(partialContext: PartialContext, plugin: PluginData) {
      const result: BuildHookContext = {
         bundler: partialContext.bundler,
         graph: partialContext.graph,
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
            error(logLevel, `[${plugin.name}] Error: ` + message);
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
      HookName extends keyof BuildHooks,
      Hook extends BuildHooks[HookName],
      HookFunction extends Hook extends BuildHookConfig ? Hook["handler"] : Hook
   >(
      hookName: HookName,
      hookArgs: Parameters<HookFunction> | (() => Parameters<HookFunction>),
      callback: (
         result: Exclude<
            Awaited<ReturnType<HookFunction>>,
            undefined | null | void
         >
      ) => void,
      ...partialContext: ThisParameterType<HookFunction> extends BuildHookContext
         ? [partialContext: PartialContext]
         : [partialContext: void]
   ) {
      const hookGroup = this._hooks[hookName];
      if (!hookGroup) return;
      const tm: any = [];
      for (const { hook, plugin } of hookGroup) {
         const context = partialContext[0]
            ? this._createContext(partialContext[0], plugin)
            : null;
         const args = typeof hookArgs == "function" ? hookArgs() : hookArgs;
         let result;
         if (typeof hook == "function") {
            result = (hook as any).apply(context, args);
         } else {
            if (hook.async === true) {
               result = await (hook.handler as any).apply(context, args);
            } else {
               result = (hook.handler as any).apply(context, args);
            }
         }

         if (result) {
            callback(result);
            // Stop when needed
            if (
               // Is chaining set to false?
               typeof hook != "function" &&
               hook.chaining === false /* ||
               // Loader hook should only apply to an asset once
               hookName == "load" */
            ) {
               break;
            }
         }
      }
   }
}
