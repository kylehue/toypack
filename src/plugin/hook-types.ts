import { Asyncify } from "type-fest";
import {
   DependencyGraph,
   Importers,
   ScriptDependency,
   StyleDependency,
} from "../parse/index.js";
import { Toypack } from "../Toypack.js";
import { CssNode, EnterOrLeaveFn, WalkOptions } from "css-tree";
import { BundleResult } from "../types";
import { ParsedScriptResult } from "../parse/parse-script-chunk.js";
import { ParsedStyleResult } from "../parse/parse-style-chunk.js";
import { LoadResult, ModuleInfo } from "../parse/load-chunk.js";
import { SpecifierOptions } from "../utils/get-import-code.js";
import { TraverseOptions } from "@babel/traverse";

// Interfaces
export interface ScriptTransformContext {
   type: "script";
   traverse: (options: TraverseOptions) => void;
   source: string;
   content: string;
}

export interface StyleTransformContext {
   type: "style";
   traverse: (options: EnterOrLeaveFn<CssNode> | WalkOptions) => void;
   source: string;
   content: string;
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
export type LoadHook = (
   this: PluginContext,
   moduleInfo: ModuleInfo
) => LoadResult | string | void;

export type ResolveHook = (this: PluginContext, id: string) => string | void;

export type TransformHook = (
   this: PluginContextBase,
   context: ScriptTransformContext | StyleTransformContext
) => void;

export type ParsedHook = (this: PluginContext, parseInfo: ParseInfo) => void;

export type StartHook = (this: PluginContextBase) => void;
export type EndHook = (this: PluginContextBase, result: BundleResult) => void;
export type SetupHook = (this: PluginContextBase) => void;

// Context
export interface PluginContextBase {
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
   /** Emits an error message. */
   emitError: (message: string) => void;
   /** Emits a warning message. */
   emitWarning: (message: string) => void;
   /** Emits an info message. */
   emitInfo: (message: string) => void;
   /** Adds an item in the plugin's cache. */
   setCache: <T = any>(
      key: string,
      value: T,
      isConfigConstrained?: boolean
   ) => T;
   /** Retrieves an item in the plugin's cache. */
   getCache: <T = any>(
      key: string,
      isConfigConstrained?: boolean
   ) => T | undefined;
   /** Removes an item in the plugin's cache. */
   removeCache: (key: string, isConfigConstrained?: boolean) => void;
   /** Performs the specified action for each cache. */
   eachCache: (callback: (value: any, key: string) => void) => void;
}

export interface PluginContext extends PluginContextBase {
   graph: DependencyGraph;
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
interface AsyncHook<Handler extends (...args: any) => any> {
   async: true;
   handler: Asyncify<Handler>;
}

interface SyncHook<Handler extends (...args: any) => any> {
   async?: false;
   handler: Handler;
}

export type ConfigurableHook<
   Handler extends (...args: any) => any = (...args: any) => any
> = {
   order?: "pre" | "post";
   chaining?: boolean;
} & (AsyncHook<Handler> | SyncHook<Handler>);

// Plugin hooks interface
export interface PluginHooks {
   /** Hook called everytime a module needs to be loaded. */
   load: LoadHook | ConfigurableHook<LoadHook>;
   /** Hook called everytime a module needs to be resolved. */
   resolve: ResolveHook | ConfigurableHook<ResolveHook>;
   /** Hook called everytime a module needs to be transformed. */
   transform: TransformHook | ConfigurableHook<TransformHook>;
   /** Hook called at the start of getting the dependency graph. */
   buildStart: StartHook | ConfigurableHook<StartHook>;
   /** Hook called at the end of the bundling process. */
   buildEnd: EndHook | ConfigurableHook<EndHook>;
   /** Hook called everytime a module is parsed. */
   parsed: ParsedHook | ConfigurableHook<ParsedHook>;
   /** Hook called only once, useful for setting up things. */
   setup: SetupHook;
}
