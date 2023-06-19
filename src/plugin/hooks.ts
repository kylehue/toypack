import type { RawSourceMap } from "source-map-js";
import { Asyncify, PartialDeep } from "type-fest";
import { IToypackConfig as ToypackConfig } from "../config";
import { IAsset } from "../utils/create-asset";
import { Toypack } from "../Toypack.js";
import { Dependency, DependencyGraph } from "../graph/index.js";

// Hooks
export type LoadBuildHook = (
   this: BuildHookContext,
   dep: {
      source: string;
      content: string | Blob;
      isEntry: boolean;
      asset?: IAsset | null;
   }
) => LoadResult | void;

export interface LoadResult {
   type: "script" | "style";
   content: string;
   map?: RawSourceMap | null;
}

export type TransformBuildHook = (this: BuildHookContext, dep: any) => void;

export type ResolveBuildHook = (this: BuildHookContext, id: string) => string | void;

export type ConfigBuildHook = (
   config: ToypackConfig
) => PartialDeep<ToypackConfig> | void;

// Context
export interface BuildHookContext {
   bundler: Toypack;
   graph: DependencyGraph;
   isEntry: boolean;
   getModuleIds: () => string[];
   getImporter: () => Dependency | null;
}

export interface PluginContextOptions {
   bundler: Toypack;
   graph: DependencyGraph;
   importer?: string | null;
   isEntry: boolean;
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
