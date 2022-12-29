import {
	AssetInterface,
	ToypackLoader,
	ParsedAsset,
	CompiledAsset,
} from "@toypack/core/types";

import { parse as getAST } from "@babel/parser";
import traverseAST from "@babel/traverse";
import {
	availablePlugins,
	transform,
} from "@babel/standalone";
import Toypack from "@toypack/core/Toypack";
import MagicString from "magic-string";

import { TransformOptions } from "@babel/core";
import { merge, cloneDeep } from "lodash";

const defaultTransformOptions: TransformOptions = {
	sourceType: "module",
	compact: false,
	presets: ["typescript", "react"],
	plugins: [availablePlugins["transform-modules-commonjs"]],
};

const defaultOptions: BabelLoaderOptions = {
	transformOptions: defaultTransformOptions,
	autoImportReactPragma: true
}

interface BabelLoaderOptions {
	/**
	 * @desc Babel transform options.
	 */
	transformOptions: TransformOptions;
	/**
	 * @default true
	 * @desc When enabled, bundler will automatically import React pragma in JSX files.
	 */
	autoImportReactPragma?: boolean;
}

export default class BabelLoader implements ToypackLoader {
	public name = "BabelLoader";
	public test = /\.([jt]sx?)$/;

	constructor(public options?: BabelLoaderOptions) {
		this.options = merge(cloneDeep(defaultOptions), options);
	}

	public compile(asset: AssetInterface) {
		if (typeof asset.content != "string") {
			let error = new Error(
				"Babel Compile Error: Asset content must be string."
			);
			throw error;
		}

		let result: CompiledAsset = {} as CompiledAsset;

		let parseMetadata = asset.loaderData.parse?.metadata;
		if (parseMetadata?.compilation) {
			result.content = parseMetadata.compilation;
		}

		if (parseMetadata?.map) {
			result.map = parseMetadata.map;
		}

		return result;
	}

	public parse(asset: AssetInterface, bundler: Toypack) {
		if (typeof asset.content != "string") {
			let error = new Error("Babel Parse Error: Asset content must be string.");
			throw error;
		}

		const isCoreModule = /^\/?node_modules\/?/.test(asset.source);

		let result: ParsedAsset = {
			dependencies: [],
			metadata: {
				depNodes: [],
			},
		};

		if (!asset.isObscure) {
			const transformOptions = {
				...this.options?.transformOptions,
				...{
					sourceFileName: asset.source,
					filename: asset.source,
					sourceMaps:
						bundler.options.bundleOptions?.mode == "development" &&
						!!bundler.options.bundleOptions?.output?.sourceMap &&
						!isCoreModule,
				} as TransformOptions,
			};

			const transpiled = transform(asset.content, transformOptions);

			if (transpiled.code) {
				let chunk = new MagicString(transpiled.code);

				const AST = getAST(transpiled.code, {
					sourceType: "script",
					sourceFilename: asset.source,
				});

				traverseAST(AST, {
					CallExpression: ({ node }) => {
						let argNode = node.arguments[0];
						let callee = node.callee;
						if (
							callee.type === "Identifier" &&
							callee.name == "require" &&
							argNode.type == "StringLiteral"
						) {
							let id = argNode.value;
							if (!id) return;
							if (result.dependencies.some((dep) => dep === id)) return;

							result.dependencies.push(id);
							result.metadata.depNodes.push(node);
						}
					},
				});

				if (/\.[jt]sx$/.test(asset.source) && this.options?.autoImportReactPragma) {
					chunk.prepend(`var React = require("react");`);
				}

				result.metadata.compilation = chunk;

				if (transpiled.map) {
					result.metadata.map = transpiled.map;
				}
			}
		}

		return result;
	}
}
