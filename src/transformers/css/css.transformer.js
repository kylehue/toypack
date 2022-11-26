import postcss from "postcss";
import valueParser from "postcss-value-parser";
import autoprefixer from "autoprefixer";
import workerManager from "../../worker/WorkerManager";
const URL_RE = /url\s*\("?(?![a-z]+:)/;
export default class CSSTransformer {
	constructor() {
		this.css = {
			content: "",
			AST: [],
			dependencies: [],
		};
	}

	async _transpileCode(code) {
		let result = "";
		try {
			if (workerManager) {
				result = await workerManager.post({
					mode: "css:transpile",
					code: code,
				});
			} else {
				result = postcss([autoprefixer]).process(code).css;
			}
		} catch (error) {
			console.warn(error);
			result = "";
		}

		return result;
	}

	async _scan(code) {
		let result = {
			dependencies: [],
			AST: [],
		};
		try {
			if (workerManager) {
				result = await workerManager.post({
					mode: "css:scan",
					code: code
				});
			} else {
				let dependencies = [];
				let AST = postcss.parse(code);

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

	async apply(asset) {
		this.css.content = await this._transpileCode(asset.content);
		let { AST, dependencies } = await this._scan(asset.content);
		this.css.AST = AST;
      this.css.dependencies = dependencies;
	}
}
