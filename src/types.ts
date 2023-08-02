import { LoadResult, ModuleInfo } from "./parse/load-chunk.js";
import {
   PluginContext,
   PluginHooks,
   ConfigurableHook,
} from "./plugin/hook-types.js";

export interface Plugin extends Partial<PluginHooks> {
   name: string;
   loaders?: Loader[];
   extensions?: ["resource" | "script" | "style", string][];
}

type CompileHandler = (
   this: PluginContext,
   moduleInfo: ModuleInfo
) => LoadResult | string | void;
export interface Loader {
   test: RegExp | ((source: string) => boolean);
   disableChaining?: boolean;
   compile: CompileHandler | ConfigurableHook<CompileHandler>;
}

export type Error = { code: number; reason: string };

export type { PluginContext, PluginHooks } from "./plugin/hook-types.js";
export type { Dependency, DependencyGraph } from "./parse/index.js";
export type { ScriptModule } from "./parse/classes/ScriptModule.js";
export type { StyleModule } from "./parse/classes/StyleModule.js";
export type { ResourceModule } from "./parse/classes/ResourceModule.js";
export type { BundleResult } from "./bundle/index.js";
export type {
   ToypackConfig,
   SourceMapConfig,
   BabelParseConfig,
   LogLevelConfig,
   ModeConfig,
   FormatConfig,
   ImportMapConfig,
} from "./config.js";
export type {
   PackageManagerConfig,
   PackageProvider,
} from "./package-manager/index.js";
export type {
   ExportInfo,
   AggregatedAllExport,
   AggregatedNameExport,
   AggregatedNamespaceExport,
   DeclaredDefaultExport,
   DeclaredDefaultExpressionExport,
   DeclaredExport,
} from "./parse/extract-exports.js";
export type {
   ImportInfo,
   DefaultImport,
   DynamicImport,
   NamespaceImport,
   SideEffectImport,
   SpecifierImport,
} from "./parse/extract-imports.js";
export type { LoadResult, ModuleInfo } from "./parse/load-chunk.js";
export type { Asset, ResourceAsset, TextAsset } from "./utils/create-asset.js";
export type { ResolveOptions } from "./utils/resolve.js";
export type Toypack = InstanceType<typeof import("./Toypack.js").Toypack>;
