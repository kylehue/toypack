import { TraverseOptions } from "@babel/traverse";
import { File } from "@babel/types";
import { CssNode, EnterOrLeaveFn, WalkOptions } from "css-tree";
import { HTMLElement } from "node-html-parser";
import { Asyncify } from "type-fest";
import { Importers } from "../parse/index.js";
import { Toypack } from "../Toypack.js";
import { ParsedScriptResult } from "../parse/parse-script-chunk.js";
import { ParsedStyleResult } from "../parse/parse-style-chunk.js";
import { SpecifierOptions } from "../utils/get-import-code.js";
import type {
   StyleModule,
   ScriptModule,
   DependencyGraph,
   BundleResult,
   LoadResult,
   ModuleInfo,
} from "src/types";
import { TraverseHtmlOptions } from "src/bundle/transform-html.js";

// Interfaces
interface ScriptParseInfo {
   type: "script";
   chunk: ScriptModule;
   parsed: ParsedScriptResult;
}
interface StyleParseInfo {
   type: "style";
   chunk: StyleModule;
   parsed: ParsedStyleResult;
}
export type ParseInfo = ScriptParseInfo | StyleParseInfo;

// Hooks
export type LoadHook = (
   this: PluginContext,
   moduleInfo: ModuleInfo
) => LoadResult | string | void;
export type ResolveHook = (this: PluginContext, id: string) => string | void;
export type ParsedHook = (this: PluginContext, parseInfo: ParseInfo) => void;
export type StartHook = (this: PluginContextBase) => void;
export type EndHook = (this: PluginContextBase, result: BundleResult) => void;
export type SetupHook = (this: PluginContextBase) => void;
export type TransformScriptHook = (
   this: PluginContext,
   source: string,
   content: string,
   ast: File
) => TraverseOptions | void;
export type TransformStyleHook = (
   this: PluginContext,
   source: string,
   content: string,
   ast: CssNode
) => EnterOrLeaveFn<CssNode> | WalkOptions | void;
export type TransformHtmlHook = (
   this: PluginContextBase,
   ast: HTMLElement,
   indexScriptUrl: string,
   indexStyleUrl: string
) => TraverseHtmlOptions | void;

// Context
export interface PluginContextBase {
   bundler: Toypack;
   cache: Map<any, any>;
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
}

export interface PluginContext extends PluginContextBase {
   graph: DependencyGraph;
   /** Returns the modules that imported the current module. */
   getImporters: () => Importers;
   /**
    * Returns the module that imported the current module. If it's the
    * entry, then it will return undefined.
    */
   getCurrentImporter: () => ScriptModule | StyleModule | undefined;
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
   /** Hook called at the start of getting the dependency graph. */
   buildStart: StartHook | ConfigurableHook<StartHook>;
   /** Hook called at the end of the bundling process. */
   buildEnd: EndHook | ConfigurableHook<EndHook>;
   /** Hook called everytime a module is parsed. */
   parsed: ParsedHook | ConfigurableHook<ParsedHook>;
   /** Hook called everytime a script module needs to be transformed. */
   transform: TransformScriptHook | ConfigurableHook<TransformScriptHook>;
   /** Hook called everytime a style module needs to be transformed. */
   transformStyle: TransformStyleHook | ConfigurableHook<TransformStyleHook>;
   /** Hook called everytime the main html needs to be transformed. */
   transformHtml: TransformHtmlHook | ConfigurableHook<TransformHtmlHook>;
   /** Hook called only once, useful for setting up things. */
   setup: SetupHook;
}
