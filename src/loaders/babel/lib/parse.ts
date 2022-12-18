import { parse as getAST } from "@babel/parser";
import traverseAST from "@babel/traverse";
import { ParsedAsset } from "@toypack/loaders/types";
import { ALLOWED_MODULE_IMPORTS_PATTERN } from "@toypack/core/globals";
import { extname } from "path";
import { isLocal } from "@toypack/utils";
function parse(content: string | Uint8Array, source: string) {
	if (typeof content != "string") {
		let error = new Error("Content must be string.");
		error.stack = "Babel Parse Error: ";
		throw error;
	}

	const AST = getAST(content, {
		sourceType: "module",
		errorRecovery: true,
		allowImportExportEverywhere: true,
		sourceFilename: source,
		plugins: ["typescript", "jsx"],
	});

	const result: ParsedAsset = {
		AST,
		dependencies: [],
	};

	function addDependency(id: string) {
		if (
			!ALLOWED_MODULE_IMPORTS_PATTERN.test(id) &&
			extname(id) &&
			isLocal(id)
		) {
			console.error(`Import Error: Importing \`${id}\` files is not allowed.`);
			return;
		}

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

export default parse;