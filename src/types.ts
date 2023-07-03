import { RawSourceMap } from "source-map-js";
import { BuildHookContext, BuildHooks } from "./plugin/hook-types.js";
import { Asset } from "./utils/create-asset.js";

export interface Plugin extends Partial<BuildHooks> {
   name: string;
   loaders?: Loader[];
   extensions?: ["resource" | "script" | "style", string][];
}

export interface Loader {
   test: RegExp | ((source: string) => boolean);
   disableChaining?: boolean;
   compile: (
      this: BuildHookContext,
      moduleInfo: {
         type: "resource" | "script" | "style";
         source: string;
         content: string | Blob;
         isEntry: boolean;
         asset: Asset;
      }
   ) =>
      | {
           content: string;
           type?: "script" | "style";
           map?: RawSourceMap | null;
        }
      | string
      | void;
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
export type { Asset, ResourceAsset, TextAsset } from "./utils/create-asset.js";
export type { ResolveOptions } from "./utils/resolve.js";
export type Toypack = InstanceType<typeof import("./Toypack.js").Toypack>;
