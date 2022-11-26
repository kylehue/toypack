import * as path from "path";
import assets from "./AssetManager";

export default class Asset {
	constructor(src, content) {
		this.name = "";
		this.src = src;
		this.ext = path.extname(this.src);
		this.type = this.ext.substr(1);
		this.content = content;
		this._cache = new Map();
	}

	async getDependencyGraph() {

		// Instantiate graph and add self in it
		const graph = [this];

		for (let asset of graph) {
			// Transform to get the dependencies
			await asset.transform();
			// Scan dependency's dependencies
			for (let dependencyPath of asset.transformer[asset.type].dependencies) {
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

	async pack() {
		let ext = path.extname(this.src);
		let type = ext.substr(1);

		if (!this.packager) {
			let { default: Packager } = await import(
				`../packagers/${type}/${type}.packager.js`
			);

			this.packager = new Packager();
		}

		if (this.content != this._cache.get("pack")) {
			let graph = await this.getDependencyGraph();
			await this.packager.apply(graph, this);
			this._cache.set("pack", this.content);
		}
	}

	async transform() {
		let ext = path.extname(this.src);
		let type = ext.substr(1);

		if (!this.transformer) {
			let { default: Transformer } = await import(
				`../transformers/${type}/${type}.transformer.js`
			);

			this.transformer = new Transformer();
		}

		if (this.content != this._cache.get("transform")) {
			await this.transformer.apply(this);
			this._cache.set("transform", this.content);
		}
	}
}
