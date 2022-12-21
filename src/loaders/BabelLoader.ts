import { createSourceMap, SourceMapData } from "@toypack/core/SourceMap";
import Toypack from "@toypack/core/Toypack";
import {
	AssetInterface,
	CompiledAsset,
	Loader,
	ParsedAsset,
} from "@toypack/core/types";

import MagicString from "magic-string";

import { parse as getAST } from "@babel/parser";
import traverseAST from "@babel/traverse";

export default class BabelLoader implements Loader {
	public name = "BabelLoader";
	public test = /\.([jt]sx?)$/;

	public parse(asset: AssetInterface, bundler: Toypack) {
		if (typeof asset.content != "string") {
			let error = new Error("Babel Parse Error: Asset content must be string.");
			throw error;
		}

		const AST = getAST(asset.content, {
			sourceType: "module",
			errorRecovery: true,
			allowImportExportEverywhere: true,
			sourceFilename: asset.source,
			plugins: ["typescript", "jsx"],
		});

		let result: ParsedAsset = {
			dependencies: [],
		};

		function addDependency(id: string) {
			let isAdded = result.dependencies.some((dep) => dep === id);
			if (!isAdded) {
				result.dependencies.push(id);
			}
		}

		traverseAST(AST, {
			ImportDeclaration: (dir: any) => {
				let id = dir.node.source.value;

				addDependency(id);
			},
			CallExpression: (dir: any) => {
				if (dir.node.callee.name == "require" && dir.node.arguments.length) {
					let id = dir.node.arguments[0].value;

					addDependency(id);
				}
			},
		});

		return result;
	}

   public compile(asset: AssetInterface, bundler: Toypack) {
      if (typeof asset.content != "string") {
         let error = new Error(
            "Babel Compile Error: Asset content must be string."
         );
         throw error;
      }
      
		let content = asset.content;
		let map: SourceMapData = {} as SourceMapData;

		if (bundler.options.bundleOptions.output.sourceMap) {
			map = new MagicString(content).generateMap({
				file: asset.source,
				source: asset.source,
				includeContent: true,
				hires: true,
			});
		}

		let result: CompiledAsset = {
			content,
			map,
		};

		return result;
	}
}
