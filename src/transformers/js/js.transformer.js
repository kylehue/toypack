import WorkerManager from "../../worker/WorkerManager";
import { transform as babelTransform } from "@babel/standalone";
import { parse as getAST } from "@babel/parser";
import traverseAST from "@babel/traverse";

let workerManager;
if (window.Worker) {
	let worker = new Worker(new URL("../../worker/Worker.js", import.meta.url));
	workerManager = new WorkerManager(worker);
}

let babelOptions = {
	presets: ["es2015-loose"],
	compact: false,
};

let ASToptions = {
	allowImportExportEverywhere: true,
	sourceType: "module",
	errorRecovery: true,
};

export default class JSTransformer {
	constructor() {
		this.js = {
			transpiled: "",
			AST: [],
			dependencies: []
		};
	}

	async _transpileCode(code) {
		let result = "";
		try {
			if (workerManager) {
				result = await workerManager.post({
					mode: "transpile",
					code: code,
					options: babelOptions,
				});
			} else {
				result = babelTransform(code, babelOptions).code;
			}
		} catch (error) {
			result = "";
		}

		return result;
	}

	async _scan(code) {
		let result = {
			dependencies: [],
			AST: []
		};
		try {
			if (workerManager) {
				result = await workerManager.post({
					mode: "scan",
					code: code,
					options: ASToptions,
				});
			} else {
				let dependencies = [];
				let AST = getAST(code, ASToptions);
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
				result = {
					AST,
					dependencies,
				};
			}
		} catch (error) {
			console.error("Scan failed.")
			result = {
				dependencies: [],
				AST: []
			};
		}

		return result;
	}

	async apply(code) {
		this.js.transpiled = await this._transpileCode(code);
		let { AST, dependencies } = await this._scan(code);
		this.js.AST = AST;
		this.js.dependencies = dependencies;
	}
}
