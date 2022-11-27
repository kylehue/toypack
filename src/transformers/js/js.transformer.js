import workerManager from "../../worker/WorkerManager";
import { transformFromAst as babelTransform, availablePlugins } from "@babel/standalone";
import { parse as getAST } from "@babel/parser";
import traverseAST from "@babel/traverse";
import * as path from "path";

export default class JSTransformer {
	constructor() {
		this.js = {
			content: "",
			AST: [],
			dependencies: [],
		};
	}

	async _transpileCode(AST, babelTransformerOptions) {
		let result = "";
		try {
			if (workerManager) {
				result = await workerManager.post({
					mode: "js:transpile",
					options: babelTransformerOptions,
					AST,
				});
			} else {
				babelTransformerOptions.plugins = babelTransformerOptions.plugins?.map(
					(plugin) => {
						return availablePlugins[plugin];
					}
				);

				result = babelTransform(AST, null, babelTransformerOptions).code;
			}
		} catch (error) {
			console.warn(error);
			result = "";
		}

		return result;
	}

	async _scan(code, babelParserOptions) {
		let result = {
			dependencies: [],
			AST: [],
		};
		try {
			if (workerManager) {
				result = await workerManager.post({
					mode: "js:scan",
					code: code,
					options: babelParserOptions,
				});
			} else {
				let dependencies = [];
				let AST = getAST(code, babelParserOptions);
				traverseAST(AST, {
					ImportDeclaration: (dir) => {
						let id = dir.node.source.value;

						// TODO: Avoid duplicates
						dependencies.push(id);

						// TODO: Should we really do this?
						// Remove import if not .js
						if (!id.endsWith(".js") && path.extname(id).length) {
							dir.remove();
						}
					},
					CallExpression: (dir) => {
						if (
							dir.node.callee.name == "require" &&
							dir.node.arguments.length
						) {
							let id = dir.node.arguments[0].value;
							dependencies.push(id);

							// Remove import if not .js
							if (!id.endsWith(".js") && path.extname(id).length) {
								dir.remove();
							}
						}
					},
				});
				result = {
					AST,
					dependencies,
				};
			}
		} catch (error) {
			console.warn(error);
			result = {
				dependencies: [],
				AST: [],
			};
		}

		return result;
	}

	async apply(asset, options = {}) {
		options = Object.assign(
			{
				babelTransformerOptions: {
					presets: ["es2015-loose"],
					compact: false,
				},
				babelParserOptions: {
					allowImportExportEverywhere: true,
					sourceType: "module",
					errorRecovery: true,
				},
			},
			options
		);

		let { AST, dependencies } = await this._scan(
			asset.content,
			options.babelParserOptions
		);

		this.js.content = await this._transpileCode(
			AST,
			options.babelTransformerOptions
		);

		this.js.AST = AST;
		this.js.dependencies = dependencies;
	}
}
