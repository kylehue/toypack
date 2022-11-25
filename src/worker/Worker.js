import { transform as babelTransform } from "@babel/standalone";
import { parse as getAST } from "@babel/parser";
import traverseAST from "@babel/traverse";
addEventListener("message", (event) => {
	let reqData = event.data;
	let data = reqData.data;

	/* if (data.mode == "AST") {
		let AST = [];

		try {
			AST = getAST(data.code, data.options);
		} catch (error) {}

		let response = {
			id: reqData.id,
			data: AST,
		};

		postMessage(response);
	} else  */if (data.mode == "scan") {
		const dependencies = [];
		let AST = [];
		try {
			AST = getAST(data.code, data.options);
			traverseAST(AST, {
				ImportDeclaration: (path) => {
					dependencies.push(path.node.source.value);
				},
				CallExpression: (path) => {
					if (
						path.node.callee.name == "require" &&
						path.node.arguments.length
					) {
						dependencies.push(path.node.arguments[0].value);
					}
				},
			});
		} catch (error) {}

		let response = {
			id: reqData.id,
			data: {
				AST, dependencies
			},
		};

		postMessage(response);
	} else if (data.mode == "transpile") {
		let transpiledCode = "";

		try {
			transpiledCode = babelTransform(data.code, data.options).code;
		} catch (error) {}

		let response = {
			id: reqData.id,
			data: transpiledCode,
		};

		postMessage(response);
	}
});
