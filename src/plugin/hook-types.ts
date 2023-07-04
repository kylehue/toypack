import { Asyncify } from "type-fest";
import {
   Dependency,
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

export type StartBuildHook = (this: BuildHookContext) => void;
export type EndBuildHook = (
   this: BuildHookContext,
   result: BundleResult
) => void;

// Context
export interface BuildHookContext {
   bundler: Toypack;
   getImporter: () => Dependency | null;
   getUsableResourcePath: (source: string, baseDir: string) => string | null;
   getImportCode: (importSource: string) => string;
   getDefaultExportCode: (exportCode: string) => string;
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
   transform: TransformBuildHook | BuildHookConfig<TransformBuildHook>;
   buildStart: StartBuildHook | BuildHookConfig<StartBuildHook>;
   buildEnd: EndBuildHook | BuildHookConfig<EndBuildHook>;
   parsed: ParsedBuildHook | BuildHookConfig<ParsedBuildHook>;
   // beforeFinalize: (content: any) => void;
   // afterFinalize: (content: any) => void;
   // start: () => void;
}
