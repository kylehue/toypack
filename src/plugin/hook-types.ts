import { Asyncify } from "type-fest";
import {
   Importers,
   ScriptDependency,
   StyleDependency,
} from "../graph/index.js";
import { Toypack } from "../Toypack.js";
import { ITraverseOptions } from "../bundle/compile-script.js";
import { CssNode, EnterOrLeaveFn, WalkOptions } from "css-tree";
import { BundleResult } from "../types";
import { ParsedScriptResult } from "../graph/parse-script-chunk.js";
import { ParsedStyleResult } from "../graph/parse-style-chunk.js";
import { LoadResult, ModuleInfo } from "../graph/load-chunk.js";
import { SpecifierOptions } from "../utils/get-import-code.js";

// Interfaces
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

export type ParseInfo =
   | {
        type: "script";
        chunk: ScriptDependency;
        parsed: ParsedScriptResult;
     }
   | {
        type: "style";
        chunk: StyleDependency;
        parsed: ParsedStyleResult;
     };

// Hooks
export type LoadBuildHook = (
   this: BuildHookContext,
   moduleInfo: ModuleInfo
) => LoadResult | string | void;

export type ResolveBuildHook = (
   this: BuildHookContext,
   id: string
) => string | void;

export type TransformBuildHook = (
   this: BuildHookContext,
   context: ScriptTransform | StyleTransform
) => void;

export type ParsedBuildHook = (
   this: BuildHookContext,
   parseInfo: ParseInfo
) => void;

export type StartBuildHook = (this: BuildHookContextBase) => void;
export type EndBuildHook = (
   this: BuildHookContextBase,
   result: BundleResult
) => void;

// Context
export interface BuildHookContextBase {
   bundler: Toypack;
   /**
    * Convert a resource's source path to a useable source path.
    * If in development mode, the resource path will become a blob url.
    * If in production mode, the resource path will have a unique hash as
    * its basename.
    */
   getUsableResourcePath: (source: string, baseDir: string) => string | null;
   /** Constructs an import code using the provided request and specifiers. */
   getImportCode: (
      request: string,
      specifiers?: (SpecifierOptions | string)[]
   ) => string;
   /**
    * Returns the default export code.
    * - e.g. `export default ... ;` or `module.exports = ... ;`
    */
   getDefaultExportCode: (exportCode: string) => string;
   /**
    * Returns the hash of the bundler's config.
    * This is helpful when caching to avoid using cached modules
    * that was compiled with different configurations.
    */
   getConfigHash: () => string;
   /** Emits an error message. */
   error: (message: string) => void;
   /** Emits a warning message. */
   warn: (message: string) => void;
   /** Emits an info message. */
   info: (message: string) => void;
}

export interface BuildHookContext extends BuildHookContextBase {
   /** Returns the modules that imported the current module. */
   getImporters: () => Importers;
   /** Returns the module that imported the current module. */
   getCurrentImporter: () => ScriptDependency | StyleDependency;
   /** Returns true if the current module should have source maps or not. */
   shouldMap: () => boolean;
   /** Pre-loads an asset. */
   load: (source: string) => Promise<LoadResult>;
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
   transform: TransformBuildHook | BuildHookConfig<TransformBuildHook>;
   buildStart: StartBuildHook | BuildHookConfig<StartBuildHook>;
   buildEnd: EndBuildHook | BuildHookConfig<EndBuildHook>;
   parsed: ParsedBuildHook | BuildHookConfig<ParsedBuildHook>;
   // beforeFinalize: (content: any) => void;
   // afterFinalize: (content: any) => void;
   // start: () => void;
}
