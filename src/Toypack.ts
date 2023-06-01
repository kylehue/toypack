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
import { getDependencyGraph, IDependency } from "./graph.js";
import { defaultOptions, IOptions } from "./options.js";
import { resolve, ResolveOptions } from "./resolve.js";

export interface Loader {
   name: string;
   test: RegExp;
   parse: (dep: IDependency) => { dependencies: string[] };
   compile: (dep: IDependency) => { content: string };
}

export class Toypack {
   public options: IOptions;
   public assets: Map<string, Asset>;
   public loaders: Loader[] = [];
   public extensions = {
      resource: resourceExtensions,
      style: styleExtensions,
      application: appExtensions,
   };
   constructor(options?: PartialDeep<IOptions>) {
      this.options = merge(cloneDeep(defaultOptions), options);

      this.assets = new Map();
      //this.loaders.push(new BabelLoader(this));
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
   }
}
