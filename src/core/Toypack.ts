import Asset from "@toypack/core/Asset";
import { ResolveOptions, ToypackOptions } from "@toypack/core/types";
import { bundleOptions } from "@toypack/core/options";

import merge from "lodash.merge";

export default class Toypack {
	assets: Map<string, Asset> = new Map();
	options: ToypackOptions = {
		bundleOptions,
	};

	constructor(options?: ToypackOptions) {
		if (options) {
			merge(this.options, options);
		}
	}

   async addAsset(source: string, content: string | ArrayBuffer) {
      

      
      let asset = new Asset(source, content);
      
      
		this.assets.set(source, asset);
	}

	bundle() {}
	resolve(path: string, options?: ResolveOptions) {}
}