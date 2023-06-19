import { DependencyGraph } from "src/graph/index.js";
import Toypack from "../Toypack.js";
import { BuildHookConfig, BuildHookContext, BuildHooks, PluginContextOptions } from "./hooks.js";

type BuildHooksGroupMap = { [key in keyof BuildHooks]?: BuildHooks[key][] };
export class PluginManager {
   private _hooks: BuildHooksGroupMap = {};

   constructor(private bundler: Toypack) {}

   public registerHook<HookName extends keyof BuildHooks>(
      hookName: HookName,
      hookFunction?: BuildHooks[HookName]
   ) {
      if (!hookFunction) return;
      let hookGroup = this._hooks[hookName];
      if (!hookGroup) {
         hookGroup = [];
         this._hooks[hookName] = hookGroup;
      }

      hookGroup.push(hookFunction);

      // Sort hooks by configuration
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

            return 0;
         })
      );
   }

   public getContext({
      bundler,
      graph,
      importer,
      isEntry,
   }: PluginContextOptions): BuildHookContext {
      return {
         bundler,
         graph,
         isEntry,
         getModuleIds: () => Object.keys(graph),
         getImporter: () => (importer ? graph[importer] : null),
      };
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
      ...context: ThisParameterType<HookFunction> extends BuildHookContext
         ? [context: BuildHookContext]
         : [context: void]
   ) {
      const ctx = context.length ? context : [{}];
      const hookGroup = this._hooks[hookName];
      if (!hookGroup) return;
      for (const hook of hookGroup) {
         let args = typeof hookArgs == "function" ? hookArgs() : hookArgs;
         let result;
         if (typeof hook == "function") {
            result = (hook as any).apply(...ctx, args);
         } else {
            if (hook.async === true) {
               result = await (hook.handler as any).apply(...ctx, args);
            } else {
               result = (hook.handler as any).apply(...ctx, args);
            }
         }

         if (result) {
            callback(result);

            // Stop when needed
            if (
               // Is chaining set to false?
               (typeof hook != "function" && hook.chaining === false) ||
               // Loader hook should only apply to an asset once
               hookName == "load"
            ) {
               break;
            }
         }
      }
   }
}