import { extname, resolve } from "path";
import { parse as getAST } from "@babel/parser";
import * as utils from "./utils";
import traverseAST from "@babel/traverse";
let babelOptions = {
	presets: ["es2015-loose"],
	plugins: [],
	compact: false,
};

import { transformFromAst as babelTransform } from "@babel/standalone";
/* import TransformWorker from "./workers/transform.worker";
let worker = new TransformWorker();
worker.postMessage("123");
worker.onmessage = (event) => {
  console.log(event);
}
console.log(); */

export default class Module {
	constructor(src, code) {
		this.ext = extname(src);

		if (this.ext != ".js") {
			throw new Error("A module must be a javascript file.");
		}

		this.src = resolve(src);
		this.code = code;
		this.previousCode = "";
    this.AST = [];
		this.transpiledCode = "";

		this.dependencies = [];
	}

	/* async updateCode(code) {
    this.code = code;
		await this.loadDependencies();
  } */

	async loadAST() {
		if (this.previousCode != this.code) {
			this.AST = await getAST(this.code, {
				allowImportExportEverywhere: true,
				sourceType: "module",
			});

			this.previousCode = this.code;
		}

    return this.AST;
	}

	async loadDependencies() {
		const dependencies = [];

		await this.loadAST();

		await traverseAST(this.AST, {
			ImportDeclaration: (path) => {
				dependencies.push(path.node.source.value);
			},
			CallExpression: (path) => {
				if (path.node.callee.name == "require" && path.node.arguments.length) {
					dependencies.push(path.node.arguments[0].value);
				}
			},
		});

		this.dependencies = dependencies;

    return this.dependencies;
	}

	async loadTranspiledCode() {
		await this.loadAST();

		if (window.Worker && false) {
		} else {
			this.transpiledCode = await babelTransform(
				this.AST,
				this.code,
				babelOptions
			).code;
		}

    return this.transpiledCode;
	}
}
