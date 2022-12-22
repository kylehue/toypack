import Toypack from "@toypack/core/Toypack";
import {
	AssetInterface,
	CompiledAsset,
	Loader,
	ParsedAsset,
} from "@toypack/core/types";
import { cleanStr, isURL } from "@toypack/utils";
import MagicString from "magic-string";
import postcss from "postcss";
import valueParser from "postcss-value-parser";
import { parse as parseCSS } from "postcss";
import { dirname } from "path";

const URLFunctionRegex = /url\s*\("?(?![a-z]+:)/;
export default class CSSLoader implements Loader {
	public name = "CSSLoader";
	public test = /\.css$/;

	public parse(asset: AssetInterface, bundler: Toypack, options) {
		if (typeof asset.content != "string") {
			let error = new Error("CSS Parse Error: Content must be string.");
			throw error;
		}

		const AST = parseCSS(asset.content, bundler.options.postCSSOptions.options);

		const result: ParsedAsset = {
			dependencies: [],
			metadata: { AST, URLDependencies: [] },
		};

		AST.walk((node: any) => {
			if (node.type == "atrule" && node.name == "import") {
				let parsedValue = valueParser(node.params);
				parsedValue.walk((valueNode: any) => {
					let dependencyId: any = null;
					if (
						valueNode.type == "function" &&
						valueNode.value == "url" &&
						valueNode.nodes.length
					) {
						dependencyId = valueNode.nodes[0]?.value;
					} else if (valueNode.value && !valueNode.nodes?.length) {
						dependencyId = valueNode.value;
					}

					if (dependencyId) {
						result.dependencies.push(dependencyId);

						// Remove from AST
						if (typeof options?.checkAtRules == "function") {
							options.checkAtRules(node, dependencyId);
						} else {
							node.remove();
						}
					}
				});
			} else if (node.type == "decl") {
				const isURLFunction = URLFunctionRegex.test(node.value);
				if (isURLFunction) {
					let parsedValue = valueParser(node.value);
					parsedValue.walk((valueNode: any) => {
						if (
							valueNode.type === "function" &&
							valueNode.value === "url" &&
							valueNode.nodes.length &&
							!valueNode.nodes[0].value.startsWith("#")
						) {
							let source = valueNode.nodes[0]?.value;
							if (!source.startsWith("data:")) {
								result.dependencies.push(source);

                        // Require asset
								let dependencyAbsolutePath = bundler.resolve(source, {
									baseDir: dirname(asset.source),
								});

								let cached = bundler.assets.get(dependencyAbsolutePath);

                        if (cached) {
                           node.value = `url("\${${cleanStr(source)}}")`;
								}
							}
						}
					});
				}
			}
		});

		return result;
	}

	public compile(asset: AssetInterface, bundler: Toypack) {
		if (typeof asset.content != "string") {
			let error = new Error("CSS Compile Error: Content must be string.");
			throw error;
		}

		const result: CompiledAsset = {
			content: {} as MagicString,
		};

		let processedContent =
			asset.loaderData.parse.metadata?.AST?.toString() || asset.content;

		// Process
		if (!isURL(asset.source)) {
			const plugins = bundler.options.postCSSOptions.plugins;
			const options = bundler.options.postCSSOptions.options;
			processedContent = postcss(plugins).process(
				processedContent,
				options
			).css;
		}

		let styleContent = 'let __styleContent__ = ("")';
		for (let line of processedContent.split("\n")) {
			line = line.replaceAll("`", "\\`");
			styleContent += `.concat(\`${line}\`)`;
		}

		let chunk = new MagicString(asset.content);

		// For dummy source map
		chunk.update(0, chunk.length(), styleContent);

		chunk.append(
			`
let __head__ = document.head || document.getElementsByTagName("head")[0];
__stylesheet__ = document.createElement("style");
__stylesheet__.dataset.toypackId = "asset-${asset.id}";
__stylesheet__.setAttribute("type", "text/css");
__head__.appendChild(__stylesheet__);
if (__stylesheet__.styleSheet){
  __stylesheet__.styleSheet.cssText = __styleContent__;
} else {
  __stylesheet__.appendChild(document.createTextNode(__styleContent__));
}
`
		);

		// Avoid style duplicates
		chunk.indent("\t").prepend(`if (!__stylesheet__) {\n`).append("\n}");

		chunk.prepend(
			`let __stylesheet__ = document.querySelector("[data-toypack-id~='asset-${asset.id}']");`
		);

		// Imports
		for (let dependency in asset.dependencyMap) {
			chunk.prepend(`var ${cleanStr(dependency)} = require("${dependency}");\n`);
		}

		result.content = chunk;

		return result;
	}
}
