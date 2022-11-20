import { extname, resolve } from "path";
import { parse as getAST } from "@babel/parser";
import * as utils from "./utils";
import traverseAST from "@babel/traverse";
let babelOptions = {
	presets: ["es2015-loose"],
	compact: false,
};

import { transform as babelTransform } from "@babel/standalone";

let worker;
if (window.Worker) {
	worker = new Worker(new URL("./workers/transform.worker", import.meta.url));
}

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
			this.AST = await getAST(this.code, {
				allowImportExportEverywhere: true,
				sourceType: "module",
			});

			this._codeCache.set("loadAST", this.code);
		}

		return this.AST;
	}

	async loadDependencies() {
		const dependencies = [];

		if (this._codeCache.get("loadDependencies") != this.code) {
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

			this.dependencies = dependencies;
			this._codeCache.set("loadDependencies", this.code);
		}

		return this.dependencies;
	}

	async loadTranspiledCode() {
		if (this._codeCache.get("loadTranspiledCode") != this.code) {
			if (worker) {
				worker.postMessage({
					code: this.code,
					options: babelOptions,
				});

				this.transpiledCode = await new Promise((resolve) => {
					worker.onmessage = (event) => {
						resolve(event.data);
					};
				});
			} else {
				this.transpiledCode = await babelTransform(
					this.code,
					babelOptions
				).code;
			}

			this._codeCache.set("loadTranspiledCode", this.code);
		}

		return this.transpiledCode;
	}
}
