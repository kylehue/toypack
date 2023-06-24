import type { RawSourceMap } from "source-map-js";
import { Asyncify } from "type-fest";
import {
   Dependency,
   ScriptDependency,
   StyleDependency,
} from "../graph/index.js";
import { Toypack } from "../Toypack.js";
import { parseURL, Asset } from "../utils";
import { ITraverseOptions } from "../bundle/compile-script.js";
import { CssNode, EnterOrLeaveFn, WalkOptions } from "css-tree";

// Interfaces
export interface ModuleInfo {
   type: "resource" | "script" | "style";
   source: string;
   content: string | Blob;
   isEntry: boolean;
   asset: Asset;
}

export interface LoadResult {
   content: string;
   type?: "script" | "style";
   map?: RawSourceMap | null;
}

export interface Loader {
   test: RegExp | ((source: string) => boolean);
   disableChaining?: boolean;
   compile: (
      this: BuildHookContext,
      moduleInfo: ModuleInfo
   ) => LoadResult | string | void;
}

export interface ScriptTransform {
   type: "script";
   chunk: ScriptDependency;
   traverse: (traverseOptions: ITraverseOptions) => void;
}

export interface StyleTransform {
   type: "style";
   chunk: StyleDependency;
   traverse: (traverseOptions: EnterOrLeaveFn<CssNode> | WalkOptions) => void;
}

// Hooks
export type LoadBuildHook = (
   this: BuildHookContext,
   moduleInfo: ModuleInfo
) => LoadResult | string | void;

export type ResolveBuildHook = (
   this: BuildHookContext,
   id: string
) => string | void;

export type StartBuildHook = (bundler: Toypack) => void;

export type TransformBuildHook = (
   this: BuildHookContext,
   context: ScriptTransform | StyleTransform
) => void;

// Context
export interface BuildHookContext {
   bundler: Toypack;
   getImporter: () => Dependency | null;
   getUsableResourcePath: (source: string, baseDir: string) => string | null;
   parseSource: typeof parseURL;
   error: (message: string) => void;
   warn: (message: string) => void;
   info: (message: string) => void;
}

// Object build hook
interface BuildHookAsync<Handler extends (...args: any) => any> {
   async: true;
   handler: Asyncify<Handler>;
}

interface BuildHookSync<Handler extends (...args: any) => any> {
   async?: false;
   handler: Handler;
}

export type BuildHookConfig<
   Handler extends (...args: any) => any = (...args: any) => any
> = {
   order?: "pre" | "post";
   chaining?: boolean;
} & (BuildHookAsync<Handler> | BuildHookSync<Handler>);

// Build hooks interface
export interface BuildHooks {
   load: LoadBuildHook | BuildHookConfig<LoadBuildHook>;
   resolve: ResolveBuildHook | BuildHookConfig<ResolveBuildHook>;
   buildStart: StartBuildHook | BuildHookConfig<StartBuildHook>;
   transform: TransformBuildHook | BuildHookConfig<TransformBuildHook>;
   // beforeFinalize: (content: any) => void;
   // afterFinalize: (content: any) => void;
   // start: () => void;
}
