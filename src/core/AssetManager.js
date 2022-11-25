import * as path from "path";
import Asset from "./Asset";
import getModuleType from "./utils/getModuleType";
class AssetManager {
	constructor() {
		this.vol = {};
	}

	async add(src, content = "", isCoreModule = false) {
		if (getModuleType(src) == "external") {
			// If src is external, get the content
			let module = this.get(src);
			if (!module) {
				let response = await fetch(src);
				if (response.ok) {
					content = await response.text();
				} else {
					console.error(`Could not fetch ${src}`);
					return;
				}
			} else {
				content = module.content;
			}
		} else {
			// If src is a core module, change its dirname to "node_modules"
			src = isCoreModule
				? path.join("/node_modules", src)
				: path.join("/", src);
		}

		let ext = path.extname(src)?.substr(1);
		let group = this.vol[ext];

		// Instantiate group if it doesn't exist
		if (!group) {
			this.vol[ext] = [];
			group = this.vol[ext];
		}

		// If it exists already, just update the content
		for (let asset of group) {
			if (asset.src == src) {
				asset.content = content;
				return;
			}
		}

		// If it doesn't exist, add
		let asset = new Asset(src, content);
		group.push(asset);
	}

	get(src) {
		src = path.join("/", src);
		let ext = path.extname(src)?.substr(1);
		let group = this.vol[ext];

		if (group) {
			for (let asset of group) {
				if (asset.src === src) {
					return asset;
				}
			}
		}
	}

	_loadIndex(modulePath) {
		let noext = path.join(modulePath, "index");

		return this._loadAsFile(noext);
	}

	_loadAsFile(relativePath) {
		let ext = path.extname(relativePath);
		let noext = ext
			? relativePath.substr(0, relativePath.indexOf(ext))
			: relativePath;

		let firstPriority = this.get(noext + ".js");
		if (firstPriority) {
			return firstPriority.src;
		}

		let secondPriority = this.get(noext + ".json");
		if (secondPriority) {
			return secondPriority.src;
		}

		// If .js or .json files aren't located, return src that matches the target with any extname
		let anyExtRegex = new RegExp(`^(/?${noext})\.[^.]+$`);
		for (let group of Object.values(this.vol)) {
			for (let content of group) {
				if (anyExtRegex.test(content.src)) {
					return content.src;
				}
			}
		}
	}

	_loadAsDirectory(relativePath) {
		let result;

		let packageJSONPath = path.join(relativePath, "package.json");
		let packageContent = this.get(packageJSONPath)?.content;
		if (packageContent) {
			let packageJSON = JSON.parse(packageContent);
			let mainPath = packageJSON.main;
			// If package.json's "main" is falsy, just load the index using relativePath
			if (!mainPath) {
				result = this._loadIndex(relativePath);
			} else {
				// Get absolute path
				let absolutePath = path.join(relativePath, mainPath);

				// [A] - Load the path using the absolutePath
				let asFile = this._loadAsFile(absolutePath);
				if (asFile) {
					result = asFile;
				} else {
					// [B] - If [A] didn't work, load the index's path using absolutePath
					let index = this._loadIndex(absolutePath);
					if (index) {
						result = index;
					} else {
						// [C] - If [B] didn't work, load the index's path using relativePath
						result = this._loadIndex(relativePath);
					}
				}
			}
		} else {
			result = this._loadIndex(relativePath);
		}

		return result;
	}

	resolve(root, relativePath) {
		let result = "";
		let moduleType = getModuleType(relativePath);

		if (moduleType == "core") {
			result = this._loadAsDirectory(path.join("node_modules", relativePath));
		} else {
			let dirname = path.dirname(root);

			let absolutePath = path.join(dirname, relativePath);

			let asFile = this._loadAsFile(absolutePath);
			if (asFile) {
				result = asFile;
			} else {
				result = this._loadAsDirectory(absolutePath);
			}
		}

		if (result) {
			return result;
		} else {
			console.error(`Unable to resolve ${relativePath}.`);
		}
	}
}

let assetManager = new AssetManager();
export default assetManager;
