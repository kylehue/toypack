import type { RawSourceMap } from "source-map-js";
import { Asyncify } from "type-fest";

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

// Hooks
export type LoadBuildHook = (dep: {
   source: string;
   content: string | Blob;
}) => {
   content: string;
   map?: RawSourceMap | null;
} | undefined;

export type TransformBuildHook = (dep: any) => undefined;

export type ResolveBuildHook = (id: string) => string | undefined;

// Build hooks interface
export interface BuildHooks {
   load: LoadBuildHook | BuildHookConfig<LoadBuildHook>;
   transform: TransformBuildHook | BuildHookConfig<TransformBuildHook>;
   resolve: ResolveBuildHook | BuildHookConfig<ResolveBuildHook>;
   // beforeFinalize: (content: any) => void;
   // afterFinalize: (content: any) => void;
   // config: (config: IToypackConfig) => Partial<IToypackConfig>;
   // start: () => void;
}

// Plugin
export type Plugin = () => { name: string } & Partial<BuildHooks>;

const myPlugin: Plugin = () => {
   const virtualModules = {};
   return {
      name: "",
      load(dep) {
         //if (!dep.params.raw) return;

         return {
            type: "script",
            content: "",
            map: null,
         };
      },
   };
};

let test = myPlugin();
