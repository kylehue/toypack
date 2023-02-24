import { Bundle } from "magic-string";
import SourceMap from "./SourceMap";
import { Asset, CompiledAsset } from "./types";

export type HookName = keyof Omit<Hooks, "taps" | "trigger">;

export interface FailedResolveDescriptor {
   target: string;
   parent: Asset;
   changeResolved: (newResolved: string) => void;
}

type FailedResolveCallback = (
   descriptor: FailedResolveDescriptor
) => void | Promise<any>;

export interface BeforeCompileDescriptor {
   asset: Asset;
}

type BeforeCompileCallback = (
   descriptor: BeforeCompileDescriptor
) => void | Promise<any>;

export interface AfterCompileDescriptor {
   compilation: CompiledAsset;
   asset: Asset;
}

type AfterCompileCallback = (
   descriptor: AfterCompileDescriptor
) => void | Promise<any>;

export interface ParseDescriptor {
   asset: Asset;
}

type ParseCallback = (descriptor: ParseDescriptor) => void | Promise<any>;

export interface FailedLoaderDescriptor {
   asset: Asset;
}

type FailedLoaderCallback = (
   descriptor: FailedLoaderDescriptor
) => void | Promise<any>;

export interface DoneDescriptor {
   content: Bundle;
}

type DoneCallback = (descriptor: DoneDescriptor) => void | Promise<any>;

export interface InstallPackageDescriptor {
   name: string;
   version: string;
   subpath: string;
}

type InstallPackageCallback = (descriptor: InstallPackageDescriptor) => void | Promise<any>;

export default class Hooks {
   public taps: Map<HookName, Function[]> = new Map();

   constructor() {}

   private _tapHook(hookName: HookName, hookFunction: Function) {
      if (typeof hookFunction == "function") {
         if (!this.taps.get(hookName)) {
            this.taps.set(hookName, []);
         }

         let hookGroup = this.taps.get(hookName);
         if (hookGroup) {
            hookGroup.push(hookFunction);
         }
      }
   }

   public async trigger(hookName: HookName, ...args) {
      let hooks = this.taps.get(hookName);
      if (hooks) {
         for (let fn of hooks) {
            await fn(...args);
         }
      }
   }

   public failedResolve(fn: FailedResolveCallback) {
      this._tapHook("failedResolve", fn);
   }

   public afterCompile(fn: AfterCompileCallback) {
      this._tapHook("afterCompile", fn);
   }

   public beforeCompile(fn: BeforeCompileCallback) {
      this._tapHook("beforeCompile", fn);
   }

   public parse(fn: ParseCallback) {
      this._tapHook("parse", fn);
   }

   public failedLoader(fn: FailedLoaderCallback) {
      this._tapHook("failedLoader", fn);
   }

   public done(fn: DoneCallback) {
      this._tapHook("done", fn);
   }

   public installPackage(fn: InstallPackageCallback) {
      this._tapHook("installPackage", fn);
   }
}
