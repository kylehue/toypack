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
import { defaultOptions, IOptions } from "./options.js";
import { resolve, ResolveOptions } from "./resolve.js";
import { Hooks } from "./Hooks.js";
import { CSSLoader } from "./loaders/CSSLoader.js";
import { SassLoader } from "./loaders/SassLoader.js";
import { JSONLoader } from "./loaders/JSONLoader.js";

(window as any).path = path;

export interface ICompileData {
   source: string;
   content: string | ArrayBuffer;
   options: IModuleOptions;
}

export interface ICompileResult {
   type: "result";
   content: string;
}

export interface ICompileRecursive {
   type: "recurse";
   use: {
      [key: string]: ICompileData[];
   };
}

export interface ILoader {
   name: string;
   test: RegExp;
   compile: (data: ICompileData) => ICompileResult | ICompileRecursive;
}

export class Toypack {
   public options: IOptions;
   public assets: Map<string, Asset>;
   public loaders: ILoader[] = [];
   public extensions = {
      resource: resourceExtensions,
      style: styleExtensions,
      application: appExtensions,
   };
   public hooks = new Hooks();
   constructor(options?: PartialDeep<IOptions>) {
      this.options = merge(cloneDeep(defaultOptions), options);

      this.assets = new Map();
      this.loaders.push(new CSSLoader(this));
      this.loaders.push(new SassLoader(this));
      this.loaders.push(new JSONLoader(this));
   }

   public resolve(relativeSource: string, options?: Partial<ResolveOptions>) {
      return resolve(this, relativeSource, options);
   }

   public setIFrame(iframe: HTMLIFrameElement) {
      this.options.iframe = iframe;
   }

   public addOrUpdateAsset(source: string, content: string) {
      source = path.join("/", source);
      const asset = new Asset(this, source, content);
      this.assets.set(source, asset);
   }

   public run() {
      const graph = getDependencyGraph(this);
      const result = bundle(this, graph);

      console.log(graph);
      console.log(result);

      if (this.options.iframe) {
         this.options.iframe.srcdoc = `<!DOCTYPE html>
<html lang="en">
   <head>
      <meta charset="UTF-8" />
      <meta http-equiv="X-UA-Compatible" content="IE=edge" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Example</title>
   </head>
   <body>
      <script>
         ${result}
      </script>
   </body>
</html>
`;
      }
   }
}
