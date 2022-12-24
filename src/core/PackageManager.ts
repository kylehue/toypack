const skypackURL = "https://cdn.skypack.dev/";
import { parse as getAST } from "@babel/parser";
import traverseAST, { NodePath, VisitNode } from "@babel/traverse";
import { cleanStr, isLocal, parsePackageName } from "@toypack/utils";
import Toypack from "./Toypack";
import path from "path-browserify";
import MagicString from "magic-string";

export interface InstallationResult {
	name: string;
	version: string;
	content: string;
}

const versionRegexString = "@v?[0-9]+\\.[0-9]+\\.[0-9]+";
const versionRegex = new RegExp(versionRegexString);

export default class PackageManager {
	private _cache = new Map();

	private _cleanPath(id: string) {
		let extension = path.extname(id);
		let name = cleanStr(id);
		return name + extension;
	}

	private async _createGraph(entrySource: string, graph: any[] = [], parentSource?: string) {
		let url = `${skypackURL}${entrySource}`;
		console.log(graph[graph.length - 1]);

		if (isLocal(entrySource) && !entrySource.startsWith("/-/") && parentSource) {
			let t = entrySource.replace(/^(?:\.\.?(?:\/|$))+/, "");
			let b = /^(\/-\/).*,mode=imports\//.exec(parentSource)?.[0];
			url = `${skypackURL}${b + t}`;
			// TODO:
			// becomes ../unoptimized/encrypter.js
			// should be /-/browserify-aes@v1.2.0-VHxtXJZIpdtZxuAwVrkN/dist=es2019,mode=imports/
			console.log(parentSource);
			console.log(url);
			console.log(parentSource);
			console.log(entrySource);
		}

		let extension = path.extname(entrySource);
		if (!extension || graph.length == 0) {
			extension = ".js";
		}
		
		let fetchResponse = await fetch(url);
		let cdnError = /^\/error\//.test(entrySource) && graph.length == 0;
		if (!fetchResponse.ok || cdnError || extension != ".js") {
			if (!fetchResponse.ok || cdnError) {
				console.warn(`Failed to fetch ${fetchResponse.url}`);
			}

			return graph;
		}

		let code = await fetchResponse.text();
		let codeAST = getAST(code, {
			sourceType: "module",
		});

		let chunk = new MagicString(code);

		let exports: string[] = [];

		const scanDeclaration = ({ node }: any) => {
			let id = node.source?.value;
			if (!id) return;

			let base = this._cleanPath(id);
			chunk.update(node.source.start, node.source.end, `"./${base}"`);

			if (exports.some((ex) => ex == id)) return;
			exports.push(id);
		};

		traverseAST(codeAST, {
			ExportDeclaration: scanDeclaration,
			ImportDeclaration: scanDeclaration,
		});

		graph.push({
			origCode: code,
			code: chunk.toString(),
			source: !/\.js$/.test(entrySource)
				? this._cleanPath(entrySource) + extension
				: this._cleanPath(entrySource),
			origSource: entrySource,
		});

		for (let exported of exports) {
			if (graph.some((dep) => dep.origSource == exported)) continue;
			await this._createGraph(exported, graph, entrySource);
		}

		return graph;
	}

	public async get(
		name: string,
		version: string = ""
	): Promise<InstallationResult> {
		let atVersion = version ? "@" + version : version;
		let targetPackage = name + atVersion;
		let packageName = parsePackageName(name).name;

		// Check cache
		let cached = this._cache.get(targetPackage);
		if (cached) {
			return cached;
		}

		// Instantiate bundler
		const bundler = new Toypack({
			bundleOptions: {
				mode: "development",
				output: {
					sourceMap: false,
					name: packageName,
				},
			},
		});
      
		// Get graph and add assets to bundle
		let graph = await this._createGraph(`${targetPackage}?dist=es2017`);
		console.log(graph);
		

		for (let asset of graph) {
			await bundler.addAsset(asset.source, asset.code);
		}

		// Bundle
		bundler.defineOptions({
			bundleOptions: {
				entry: graph[0].source,
			},
		});

		let bundle = await bundler.bundle();

		let fetchedVersion: any = new RegExp(packageName + versionRegexString).exec(
			graph[0].code
		);

		if (fetchedVersion) {
			fetchedVersion = versionRegex.exec(fetchedVersion[0])?.[0].substring(1);
		}

		let result: InstallationResult = {
			name: packageName,
			version: fetchedVersion,
			content: bundle.content,
		};

		// Cache
		this._cache.set(targetPackage, result);

		return result;
	}
}
