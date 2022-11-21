import { transform as babelTransform } from "@babel/standalone";
import { parse as getAST } from "@babel/parser";
import traverseAST from "@babel/traverse";
addEventListener("message", (event) => {
	let reqData = event.data;
	let data = reqData.data;

	let response;
	if (data.type == "AST") {
		response = {
			id: reqData.id,
			data: getAST(data.code, data.options),
		};
  } else if (data.type == "scan") {
    const dependencies = [];
		traverseAST(getAST(data.code, data.options), {
			ImportDeclaration: (path) => {
				dependencies.push(path.node.source.value);
			},
			CallExpression: (path) => {
				if (path.node.callee.name == "require" && path.node.arguments.length) {
					dependencies.push(path.node.arguments[0].value);
				}
			},
    });
    
    response = {
			id: reqData.id,
			data: dependencies,
		};
	} else if (data.type == "transpile") {
		response = {
			id: reqData.id,
			data: babelTransform(data.code, data.options).code,
		};
	}

	postMessage(response);
});
