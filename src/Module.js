import { extname, resolve } from "path";
import { parse as getAST } from "@babel/parser";
import * as utils from "./utils";
import traverseAST from "@babel/traverse";
let babelOptions = {
	presets: ["es2015-loose"],
	compact: false,
};
let ASToptions = {
	allowImportExportEverywhere: true,
	sourceType: "module",
	errorRecovery: true,
};

import WorkerManager from "./WorkerManager";
import { transform as babelTransform } from "@babel/standalone";

let workerManager;
if (window.Worker) {
	let worker = new Worker(
		new URL("./workers/transform.worker", import.meta.url)
	);
	workerManager = new WorkerManager(worker);
}

window.wm = workerManager;

export default class Module {
	constructor(src, code) {
		this.ext = extname(src);

		if (this.ext != ".js") {
			throw new Error("A module must be a javascript file.");
		}

		this.src = src;
		this.code = code;
		this._codeCache = new Map();
		this.AST = [];
		this.transpiledCode = "";

		this.dependencies = [];
	}

	async updateCode(code) {
		this.code = code;
		await this.loadDependencies();

		return this.code;
	}

	async loadAST() {
		if (this._codeCache.get("loadAST") != this.code) {
			try {
				if (window.Worker) {
					this.AST = await workerManager.post({
						type: "AST",
						code: this.code,
						ASToptions,
					});
				} else {
					this.AST = await getAST(this.code, ASToptions);
				}
			} catch (error) {
				this.AST = [];
			}
			
			this._codeCache.set("loadAST", this.code);
		}
	}

	async loadDependencies() {
		let dependencies = [];

		if (this._codeCache.get("loadDependencies") != this.code) {
			try {
				if (window.Worker) {
					dependencies = await workerManager.post({
						type: "scan",
						code: this.code,
						options: ASToptions,
					});
				} else {
					await this.loadAST();
					await traverseAST(this.AST, {
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
				}

				this.dependencies = dependencies;
			} catch (error) {
				this.dependencies = [];
			}
			this._codeCache.set("loadDependencies", this.code);
		}
	}

	async loadTranspiledCode() {
		if (this._codeCache.get("loadTranspiledCode") != this.code) {
			try {
				if (window.Worker) {
					this.transpiledCode = await workerManager.post({
						type: "transpile",
						code: this.code,
						options: babelOptions,
					});
				} else {
					this.transpiledCode = await babelTransform(this.code, babelOptions)
						.code;
				}
			} catch (error) {
				this.transpiledCode = "";
			}

			this._codeCache.set("loadTranspiledCode", this.code);
		}
	}
}
