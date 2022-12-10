import { Asset } from "@toypack/loaders/types";
import * as path from "path";
import {
	LOADERS,
	CACHED_ASSETS,
	RESOLVE_PRIORITY,
	addAsset,
} from "@toypack/core/Toypack";
import { isLocal, isURL } from "@toypack/utils";
import { POLYFILLS } from "@toypack/core/polyfill";
import fs from "fs";
import resolve from "resolve";

/**
 * @param {string} entryId The entry point of the graph.
 */
export default async function createDependencyGraph(entryId: string) {
	let graph: Array<Asset> = [];
	
	async function scanModule(moduleId: string) {
		let moduleExtname = path.extname(moduleId);
		let moduleContent: any = null;
		let cached = CACHED_ASSETS.get(moduleId);
		
		try {
			// [1] - Get module contents
			// If module id is an external URL, check cache
			if (isURL(moduleId)) {
				// Add to assets if not in cache
				let asset = await addAsset({
					source: moduleId,
				});

				moduleContent = asset.content;
			} else {
				moduleContent = fs.readFileSync(moduleId, "utf-8");
			}

			if (moduleContent) {
				// [2] - Get loader and parse the module content so we can get its dependencies
				const LOADER = LOADERS.find((ldr: any) => ldr.test.test(moduleId));
				if (LOADER) {
					let moduleData: any = null;

					// Avoid parsing if the module content and the cached content is still equal
					if (cached && cached.content == moduleContent) {
						moduleData = cached.data;
					} else {
						moduleData = LOADER.use.parse(moduleContent, moduleId);
					}

					// [3] - Add module to graph along with its parsed data
					// Instantiate asset
					const ASSET: Asset = {
						id: moduleId,
						data: moduleData,
						content: moduleContent,
                  loader: LOADER,
                  dependencyMap: {}
					};

					// Add to graph
					graph.push(ASSET);

					// Add to cache
					CACHED_ASSETS.set(moduleId, cached ? Object.assign(cached, ASSET) : ASSET);

					// [4] - Scan the module's dependencies
					for (let dependency of moduleData.dependencies) {
						// Skip core modules
						if (!isLocal(dependency)) continue;

						let dependencyAbsolutePath: any = null;

						// Only resolve if not a URL
						if (!isURL(dependency)) {
							// Then resolve
							dependencyAbsolutePath = resolve.sync(dependency, {
								basedir: path.dirname(moduleId),
								extensions: RESOLVE_PRIORITY,
							});
						} else {
							dependencyAbsolutePath = dependency;
                  }
                  
						// Add to dependency map
                  ASSET.dependencyMap[dependency] = dependencyAbsolutePath;

						// Check if it exists in the graph already before scanning to avoid duplicates
						let isScanned = graph.some(
							(p: any) => p.id == dependencyAbsolutePath
						);

						if (!isScanned) {
							await scanModule(dependencyAbsolutePath);
						}
					}
				} else {
					console.error(`Dependency Graph Error: ${moduleExtname} files are not yet supported.`);
				}
			}
		} catch (error) {
			console.error(error);
		}
	}

	// Scan recursively for dependencies
	await scanModule(entryId);

	return graph;
}
