import type { RawSourceMap } from "source-map-js";
import { Asyncify, PartialDeep } from "type-fest";
import { ToypackConfig as ToypackConfig } from "../config";
import { Asset } from "../utils/create-asset";
import { Toypack } from "../Toypack.js";
import { Dependency, DependencyGraph } from "../graph/index.js";
import { parseURL } from "../utils/parse-url.js";

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
   compile: (moduleInfo: ModuleInfo) => LoadResult | string;
}

// Hooks
export type LoadBuildHook = (
   this: BuildHookContext,
   moduleInfo: ModuleInfo
) => LoadResult | string | void;

export type LoaderBuildHook = () => Loader;

export type TransformBuildHook = (
   this: BuildHookContext,
   moduleInfo: any
) => void;

export type ResolveBuildHook = (
   this: BuildHookContext,
   id: string
) => string | void;

export type ConfigBuildHook = (
   config: ToypackConfig
) => PartialDeep<ToypackConfig> | void;

// Context
export interface BuildHookContext {
   bundler: Toypack;
   graph: DependencyGraph;
   getImporter: () => Dependency | null;
   error: (message: string) => void;
   warn: (message: string) => void;
   info: (message: string) => void;
   getUsableResourcePath: (source: string, baseDir: string) => string | null;
   parseSource: typeof parseURL;
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
   config: ConfigBuildHook | BuildHookConfig<ConfigBuildHook>;
   //transform: TransformBuildHook | BuildHookConfig<TransformBuildHook>;
   // beforeFinalize: (content: any) => void;
   // afterFinalize: (content: any) => void;
   // start: () => void;
}
