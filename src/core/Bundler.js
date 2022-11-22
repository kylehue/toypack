import { fs } from "memfs";
import * as path from "path";
import validateLoad from "./utils/validateLoad";

export default class Bundler {
	constructor(options) {
		this.options = Object.assign(
			{
				async: true,
			},
			options
		);

		this.entry = "";
	}

	addFile(src, code) {
		let dirname = path.dirname(src);

		if (dirname != "/") {
			fs.mkdirSync(dirname, { recursive: true });
		}

		fs.writeFileSync(src, code);
	}

	setEntry(src) {
		this.entry = src;
	}

	_getDependencyGraph() {
		return [];
	}

	_getTransformer(ext) {
		return {
			apply() {},
		};
	}

	_getLoader(ext) {
		return {
			apply() {},
		};
   }
   
   _createBundle(code) {
      return {
         url: "",
         code: code,
         chunks: []
      }
   }

	async bundle() {
		let dependencyGraph = this._getDependencyGraph();
      let bundles = [];

		// Scan assets
		for (let asset of dependencyGraph) {
			let ext = path.extname(asset.src);

			// Get asset's transformer
			let transformer = this._getTransformer(ext);
			let loader = this._getLoader(ext);

			if (transformer && loader) {
				// Apply transformer to asset's code
				let transformedCode = transformer.apply(asset.code);

				// Apply loader
				let load = loader.apply(transformedCode);
				let isProperLoad = validateLoad(load);
            if (isProperLoad) {
               let bundle = this._createBundle();
               bundles.push(bundle);
					bundle.head.push(load[0]);
					bundle.body.push(load[1]);
				}
			} else {
				// If transformer doesn't exist, throw an error
				console.error(`${ext} files are not supported.`);
			}
		}
	}
}
