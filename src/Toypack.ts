import { cloneDeep, merge } from "lodash-es";
import path from "path-browserify";
import { PartialDeep } from "type-fest";
import { Asset } from "./asset.js";
import { bundle } from "./bundle.js";
import {
   appExtensions,
   resourceExtensions,
   styleExtensions,
} from "./extensions.js";
import { getDependencyGraph, IDependency, IModuleOptions } from "./graph.js";
import { Hooks } from "./Hooks.js";
import { JSONLoader } from "./loaders/JSONLoader.js";
import { SassLoader } from "./loaders/SassLoader.js";
import { defaultOptions, IOptions } from "./options.js";
import { resolve, IResolveOptions } from "./resolve.js";

(window as any).path = path;

export interface ISourceMap {
   version: 3;
   names: string[];
   sources: string[];
   sourcesContent: string[];
   mappings: string;
}

export interface ICompileData {
   source: string;
   content: string | ArrayBuffer;
   options: IModuleOptions;
}

export interface ICompileResult {
   type: "result";
   content: string;
   map?: ISourceMap;
}

export interface ICompileRecursive {
   type: "recurse";
   use: Record<string, ICompileData[]>;
}

export interface ILoader {
   name: string;
   test: RegExp;
   compile: (data: ICompileData) => ICompileResult | ICompileRecursive;
}

export interface IPlugin {
   name: string;
   apply: (bundler: Toypack) => void;
}

export class Toypack {
   public options: IOptions;
   public assets: Map<string, Asset>;
   public loaders: ILoader[] = [];
   public extensions = {
      resource: [...resourceExtensions],
      style: [...styleExtensions],
      script: [...appExtensions],
   };
   public hooks = new Hooks();
   constructor(options?: PartialDeep<IOptions>) {
      this.options = merge(cloneDeep(defaultOptions), options);

      this.assets = new Map();
      this.useLoader(new SassLoader(this));
      this.useLoader(new JSONLoader(this));

      if (this.options.logLevel == "error") {
         this.hooks.onError((error) => {
            console.error(error.reason);
         });
      }
   }

   public usePlugin(plugin: IPlugin) {
      plugin.apply(this);
   }

   public useLoader(loader: ILoader) {
      this.loaders.push(loader);
   }

   public resolve(relativeSource: string, options?: Partial<IResolveOptions>) {
      return resolve(this, relativeSource, options);
   }

   public setIFrame(iframe: HTMLIFrameElement) {
      this.options.iframe = iframe;
   }

   public addOrUpdateAsset(source: string, content: string) {
      source = path.join("/", source);
      const asset = new Asset(this, source, content);
      this.assets.set(source, asset);
      return asset;
   }

   public run() {
      const graph = getDependencyGraph(this);
      console.log("Graph:", graph);
      const result = bundle(this, graph);
      console.log("Bundle:", result);


      if (this.options.iframe) {
         this.options.iframe.srcdoc = `<!DOCTYPE html>
<html lang="en">
   <head>
      <meta charset="UTF-8" />
      <meta http-equiv="X-UA-Compatible" content="IE=edge" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Example</title>
      <style type="text/css">
         ${result.style}
      </style>
   </head>
   <body>
      <script>
         ${result.script}
      </script>
   </body>
</html>
`;
      }
   }
}

/* Other exports */
export * as Babel from "@babel/standalone";
export { Asset };
export type { IDependency, IOptions };