const skypackURL = "https://cdn.skypack.dev/";
import { parse as getAST } from "@babel/parser";
import traverseAST, { NodePath, VisitNode } from "@babel/traverse";
import { cleanStr, parsePackageName } from "@toypack/utils";
import Toypack from "./Toypack";
import path from "path";
import MagicString from "magic-string";
import { polyfills } from "./polyfills";

export interface InstallationResult {
	name: string;
	version: string;
	content: string;
}

const versionRegex = /@v[0-9]+\.[0-9]+\.[0-9]+/;

export default class PackageManager {
	private _cache = new Map();

	private async _load(url: string) {
		/* Instantiate sandbox
		const sandbox = document.createElement("iframe");
		const code = `<html><script type="module">import * as _ from "${url}"; console.log(_);</script></html>`;
		sandbox.srcdoc = code;
		// Load
		sandbox.style.display = "none";
		document.body.appendChild(sandbox);
		await new Promise((resolve) => {
			sandbox.addEventListener("load", () => {
				sandbox.remove();
				resolve(1);
			});
		}); */
	}

	private _cleanPath(id: string) {
		let extension = path.extname(id);
		let name = cleanStr(id);
		return name + extension;
	}

	private async _createGraph(entrySource: string, graph: any[] = []) {
		let url = `${skypackURL}${entrySource}`;
		let fetchResponse = await fetch(url);
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

		let fetchedVersion: any = versionRegex.exec(code);
		if (fetchedVersion) {
			fetchedVersion = (fetchedVersion[0] as string).substring(1);
		} else {
			fetchedVersion = "";
		}

		graph.push({
			code: chunk.toString(),
			source: this._cleanPath(entrySource),
			origSource: entrySource,
			fetchedVersion,
		});

		for (let exported of exports) {
			if (graph.some((dep) => dep.origSource == exported)) continue;
			await this._createGraph(exported, graph);
		}

		return graph;
	}

	public async get(
		name: string,
		version: string = ""
	): Promise<InstallationResult> {
      let polyfilledName = "";

      if (name in polyfills) {
         polyfilledName = polyfills[name];
      }

		let atVersion = version ? "@" + version : version;
		let targetPackage = name + atVersion;

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
               name: parsePackageName(name).name
				},
			},
      });
      
		// Get graph and add assets to bundle
      let polyfilledTarget = polyfilledName ? polyfilledName + atVersion : targetPackage;
		let graph = await this._createGraph(`${polyfilledTarget}`);
		graph[0].source += ".js";

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

		let result: InstallationResult = {
			name,
			version: graph[0].fetchedVersion,
			content: bundle.content,
		};

		// Cache
		this._cache.set(targetPackage, result);

		return result;
	}
}
