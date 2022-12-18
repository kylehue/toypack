import { Asset, ParsedAsset } from "@toypack/loaders/types";
import * as path from "path";
import {
	CACHED_ASSETS,
	RESOLVE_PRIORITY,
	addAsset,
} from "@toypack/core/Toypack";
import { isLocal, isURL } from "@toypack/utils";
import resolve from "resolve";

const GRAPH_CACHE: Map<string, Asset> = new Map();

/**
 * @param {string} source The entry point of the graph.
 */

export default async function createDependencyGraph(
	source: string,
	fromGraph: Asset[] = []
) {
	let asset = CACHED_ASSETS.get(source);
	let cached = GRAPH_CACHE.get(source);

	if (asset) {
		// If asset source is external or blobby, add it to the graph without scanning
		if (isURL(source) || typeof asset.content != "string") {
			fromGraph.push(asset);
		} else {
			let parsedData: ParsedAsset;

			// Reuse the old parse data if content didn't change
			if (asset.content == cached?.content && cached?.data) {
				parsedData = cached.data;
			} else {
				parsedData = await asset.loader.use.parse(asset.content, source);
			}

			// Update cache's data
			asset.data = parsedData;
			asset.dependencyMap = {};

			// Add to graph
			fromGraph.push(asset);

			// Cache
			GRAPH_CACHE.set(asset.source, Object.assign({}, asset));

			// Scan asset's dependencies
			for (let dependency of parsedData.dependencies) {
				// Skip core modules
				let isCoreModule = !isLocal(dependency) && !isURL(dependency);
				if (isCoreModule) continue;

				let dependencyAbsolutePath: string = dependency;

				// If not a url, resolve
				if (!isURL(dependency)) {
					dependencyAbsolutePath = resolve.sync(dependency, {
						basedir: path.dirname(source),
						extensions: RESOLVE_PRIORITY,
					});
				} else {
					// If a URL and not in cache, add to assets
					if (!CACHED_ASSETS.get(dependency)) {
						await addAsset(dependency);
					}
				}

				// Add to dependency mapping
				asset.dependencyMap[dependency] = CACHED_ASSETS.get(
					dependencyAbsolutePath
				)?.id;
				
				// Scan
				let isAdded = fromGraph.some((p) => p.source == dependencyAbsolutePath);

				if (!isAdded) {
					await createDependencyGraph(dependencyAbsolutePath, fromGraph);
				}
			}
		}
	} else {
		throw new Error(`Dependency Graph Error: Cannot find asset ${source}.`);
	}

	return fromGraph;
}