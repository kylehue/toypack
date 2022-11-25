import * as path from "path";
import assets from "./AssetManager";

export default class Asset {
	constructor(src, content) {
		this.src = src;
		this.content = content;
		this._cache = new Map();
		this.transformed = null;
	}

	async getDependencyGraph() {
		await this.transform();

		// Instantiate graph and self in it
		const graph = [this];

		for (let asset of graph) {
			// Scan dependency's dependencies
			for (let dependencyPath of asset.transformer.js.dependencies) {
				// Get dependency
				let dependencyAsset = assets.get(
					assets.resolve(asset.src, dependencyPath)
				);

				// Load transform
				await dependencyAsset.transform();

				// Avoid duplicates
				if (!graph.includes(dependencyAsset)) {
					// Add to graph
					graph.push(dependencyAsset);
				}
			}
		}

		return graph;
	}

	async transform() {
		let ext = path.extname(this.src);
		let type = ext.substr(1);

		if (!this.transformer) {
			let Transformer = await import(
				`../transformers/${type}/${type}.transformer.js`
			);

			this.transformer = new Transformer.default();
		}

		if (this.content != this._cache.get("transform")) {
			this.transformed = await this.transformer.apply(this.content);
			this._cache.set("transform", this.content);
		}
	}
}
