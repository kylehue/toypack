import { BuildHooks, Loader } from "./plugin/hook-types.js";

export type Plugin = () => {
   name: string;
   loaders?: Loader[];
   extensions?: ["resource" | "script" | "style", string][];
} & Partial<BuildHooks>;
export type {
   Loader,
   LoadResult,
   ModuleInfo,
   BuildHookContext,
   BuildHooks,
} from "./plugin/hook-types.js";
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
   Package,
   PackageManagerConfig,
   PackageProvider,
} from "./package-manager/index.js";
export type { Asset, ResourceAsset, TextAsset, ResolveOptions } from "./utils";
export type Toypack = InstanceType<typeof import("./Toypack.js").Toypack>;
