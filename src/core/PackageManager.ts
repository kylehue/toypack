const skypackURL = "https://cdn.skypack.dev/";
import { parse as getAST } from "@babel/parser";
import traverseAST, { NodePath, VisitNode } from "@babel/traverse";
import { cleanStr } from "@toypack/utils";
import Toypack from "./Toypack";
import path from "path";
import MagicString from "magic-string";
import { polyfills } from "./polyfills";
class PackageManager {
	private _cache = new Map();

	private async _load(url: string) {
		// Instantiate sandbox
		// const sandbox = document.createElement("iframe");
		// const code = `<html><script type="module">import * as _ from "${url}"; console.log(_);</script></html>`;
		// sandbox.srcdoc = code;
		// // Load
		// sandbox.style.display = "none";
		// document.body.appendChild(sandbox);
		// await new Promise((resolve) => {
		// 	sandbox.addEventListener("load", () => {
		// 		sandbox.remove();
		// 		resolve(1);
		// 	});
		// });
	}

	private _cleanPath(id: string) {
		let extension = path.extname(id);
		let name = cleanStr(id);
		return name + extension;
	}

	private async _createGraph(entrySource: string, graph: any[] = []) {
		let url = `${skypackURL}${entrySource}`;
		let code = await (await fetch(url)).text();
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
			code: chunk.toString(),
			source: this._cleanPath(entrySource),
			origSource: entrySource,
		});

		for (let exported of exports) {
			if (graph.some((dep) => dep.origSource == exported)) continue;
			await this._createGraph(exported, graph);
		}

		return graph;
   }

   public async get(name: string, version: string = "") {
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
				},
			},
		});

		// Get graph and add assets to bundle
      let graph = await this._createGraph(`${targetPackage}?min`);
      graph[0].source += ".js";
      
		for (let asset of graph) {
			bundler.addAsset(asset.source, asset.code);
      }

		// Bundle
		bundler.defineOptions({
			bundleOptions: {
				entry: graph[0].source,
			},
      });
      
		let bundle = await bundler.bundle();

		// Cache
		this._cache.set(targetPackage, bundle);

		return bundle;
	}
}

const packageManager = new PackageManager();

export default packageManager;
