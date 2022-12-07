import { parse as getAST } from "@babel/parser";
import traverseAST from "@babel/traverse";
import { ParsedAsset } from "@toypack/loaders/types";
import { ALLOWED_MODULE_IMPORTS_PATTERN } from "@toypack/core/globals";
import { extname } from "path";
export default function parse(content: string) {
	const AST = getAST(content, {
		sourceType: "unambiguous",
		errorRecovery: true,
		plugins: [],
	});

	const result: ParsedAsset = {
		AST,
		dependencies: [],
	};
	
	function addDependency(id: string) {
		if (!ALLOWED_MODULE_IMPORTS_PATTERN.test(id)) {
			console.error(`Import Error: Importing \`${extname(id)}\` files is not allowed.`);
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
