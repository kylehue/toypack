import {
	transformFromAst as babelTransform,
	availablePlugins,
} from "@babel/standalone";
import { parse as getAST } from "@babel/parser";
import traverseAST from "@babel/traverse";
import postcss from "postcss";
import valueParser from "postcss-value-parser";
import autoprefixer from "autoprefixer";
import { extname } from "path";
const URL_RE = /url\s*\("?(?![a-z]+:)/;
addEventListener("message", (event) => {
	let reqData = event.data;
	let data = reqData.data;

	function post(response) {
		postMessage({
			id: reqData.id,
			data: response,
		});
	}

	if (data.mode == "js:scan") {
		const dependencies = [];
		let AST = [];
		try {
			AST = getAST(data.code, data.options);
			traverseAST(AST, {
				ImportDeclaration: (dir) => {
					let id = dir.node.source.value;
					dependencies.push(id);

					// Remove import if not .js
					if (!id.endsWith(".js") && extname(id).length) {
						dir.remove();
					}
				},
				CallExpression: (dir) => {
					if (dir.node.callee.name == "require" && dir.node.arguments.length) {
						let id = dir.node.arguments[0].value;
						dependencies.push(id);

						// Remove import if not .js
						if (!id.endsWith(".js") && extname(id).length) {
							dir.remove();
						}
					}
				},
			});
		} catch (error) {}

		post({
			AST,
			dependencies,
		});
	} else if (data.mode == "js:transpile") {
		let transpiledCode = "";

		try {
			data.options.plugins = data.options.plugins?.map((plugin) => {
				return availablePlugins[plugin];
			});

			transpiledCode = babelTransform(data.AST, null, data.options).code;
		} catch (error) {}

		post(transpiledCode);
	} else if (data.mode == "css:scan") {
		let dependencies = [];
		let AST = postcss.parse(data.code);

		// Get dependencies that is using `@import`
		AST.walkAtRules((node) => {
			if (node.name == "import") {
				let parsedValue = valueParser(node.params);
				parsedValue.walk((valueNode) => {
					if (
						valueNode.type == "function" &&
						valueNode.value == "url" &&
						valueNode.nodes.length
					) {
						dependencies.push(valueNode.nodes[0]?.value);
					} else if (valueNode.value && !valueNode.nodes?.length) {
						dependencies.push(valueNode.value);
					}
				});
			}
		});

		// Get dependencies that is using `url()`
		AST.walkDecls((node) => {
			const isURL = URL_RE.test(node.value);
			if (isURL) {
				let parsedValue = valueParser(node.value);
				parsedValue.walk((valueNode) => {
					if (
						valueNode.type === "function" &&
						valueNode.value === "url" &&
						valueNode.nodes.length &&
						!valueNode.nodes[0].value.startsWith("#")
					) {
						dependencies.push(valueNode.nodes[0]?.value);
					}
				});
			}
		});

		post({
			AST,
			dependencies,
		});
	} else if (data.mode == "css:transpile") {
		let transpilation = postcss([autoprefixer]).process(data.code).css;

		post(transpilation);
	}
});
