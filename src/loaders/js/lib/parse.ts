import { parse as getAST } from "@babel/parser";
import traverseAST from "@babel/traverse";
import { ParsedAsset } from "@toypack/loaders/types";

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
   
	traverseAST(AST, {
		ImportDeclaration: (dir: any) => {
			let id = dir.node.source.value;
         let isAdded = result.dependencies.some((dep) => dep === id);
         
			if (!isAdded) {
				result.dependencies.push(id);
			}
		},
		CallExpression: (dir: any) => {
			if (dir.node.callee.name == "require" && dir.node.arguments.length) {
				let id = dir.node.arguments[0].value;
				let isAdded = result.dependencies.some((dep) => dep === id);

				if (!isAdded) {
					result.dependencies.push(id);
				}
			}
		},
	});

	return result;
}
