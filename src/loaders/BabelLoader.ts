import {
	AssetInterface,
	Loader,
	ParsedAsset,
} from "@toypack/core/types";

import { parse as getAST } from "@babel/parser";
import traverseAST from "@babel/traverse";

export default class BabelLoader implements Loader {
	public name = "BabelLoader";
	public test = /\.([jt]sx?)$/;

	public parse(asset: AssetInterface) {
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
			metadata: { AST },
		};

		function addDependency(id: string) {
			if (!id) return;
			if (result.dependencies.some((dep) => dep === id)) return;
			result.dependencies.push(id);
		}

		traverseAST(AST, {
			ImportDeclaration: ({node}: any) => {
				let id = node.source.value;

				addDependency(id);
			},
			ExportDeclaration: ({node}: any) => {
				let id = node.source?.value;

				addDependency(id);
			},
			CallExpression: ({node}: any) => {
				if (node.callee.name == "require" && node.arguments.length) {
					let id = node.arguments[0].value;

					addDependency(id);
				}
			},
		});

		return result;
	}
}
