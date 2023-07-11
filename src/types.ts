import { LoadResult, ModuleInfo } from "./graph/load-chunk.js";
import {
   BuildHookContext,
   BuildHooks,
   BuildHookConfig,
} from "./plugin/hook-types.js";

export interface Plugin extends Partial<BuildHooks> {
   name: string;
   loaders?: Loader[];
   extensions?: ["resource" | "script" | "style", string][];
}

type CompileHandler = (
   this: BuildHookContext,
   moduleInfo: ModuleInfo
) => LoadResult | string | void;
export interface Loader {
   test: RegExp | ((source: string) => boolean);
   disableChaining?: boolean;
   compile: CompileHandler | BuildHookConfig<CompileHandler>;
}

export type { BuildHookContext, BuildHooks } from "./plugin/hook-types.js";
export type {
   Dependency,
   DependencyGraph,
   ResourceDependency,
   ScriptDependency,
   StyleDependency,
} from "./graph/index.js";
export type { BundleResult } from "./bundle/index.js";
export type {
   ToypackConfig,
   SourceMapConfig,
   BabelParseConfig,
   BabelTransformConfig,
   LogLevelConfig,
   ModeConfig,
   ModuleTypeConfig,
} from "./config.js";
export type {
   PackageManagerConfig,
   PackageProvider,
} from "./package-manager/index.js";
export type { LoadResult, ModuleInfo } from "./graph/load-chunk.js";
export type { Asset, ResourceAsset, TextAsset } from "./utils/create-asset.js";
export type { ResolveOptions } from "./utils/resolve.js";
export type Toypack = InstanceType<typeof import("./Toypack.js").Toypack>;
