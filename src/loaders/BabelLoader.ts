import {
	IAsset,
	ToypackLoader,
	ParsedAsset,
	CompiledAsset,
} from "@toypack/core/types";

import { parse as getAST } from "@babel/parser";
import { transformFromAst } from "@babel/standalone";
import Toypack from "@toypack/core/Toypack";
import MagicString from "magic-string";
import traverse from "@babel/traverse";
import { TransformOptions } from "@babel/core";
import { merge, cloneDeep } from "lodash-es";
import { getModuleImports } from "@toypack/utils";
import SourceMap from "@toypack/core/SourceMap";

const defaultTransformOptions: TransformOptions = {
	sourceType: "module",
	compact: false,
	presets: ["typescript", "react", "env"],
};

const defaultOptions: BabelLoaderOptions = {
	transformOptions: defaultTransformOptions,
};

interface BabelLoaderOptions {
	/**
	 * Babel transform options.
	 */
	transformOptions: TransformOptions;
}

export default class BabelLoader implements ToypackLoader {
	public name = "BabelLoader";
	public test = /\.([jt]sx?)$/;

	constructor(public options?: BabelLoaderOptions) {
		this.options = merge(cloneDeep(defaultOptions), options);
	}

	public compile(asset: IAsset, bundler: Toypack) {
		if (typeof asset.content != "string") {
			let error = new Error(
				"Babel Compile Error: Asset content must be string."
			);
			throw error;
		}

		let result: CompiledAsset = {} as CompiledAsset;

		if (!asset.isObscure) {
			const isCoreModule = /^\/node_modules\//.test(asset.source);
			const transformOptions = {
				...this.options?.transformOptions,
				...({
					sourceFileName: asset.source,
					filename: asset.source,
					sourceMaps:
						bundler.options.bundleOptions?.mode == "development" &&
						!!bundler.options.bundleOptions?.output?.sourceMap &&
						!isCoreModule,
					envName: bundler.options.bundleOptions?.mode,
				} as TransformOptions),
			};

			let parseMetadata = asset.loaderData.parse?.metadata;

			// Transpile
			const transpiled: any = transformFromAst(
				parseMetadata.AST,
				undefined,
				transformOptions
			);

			if (transpiled?.code) {
				let chunk = new MagicString(transpiled.code);
				result.content = chunk;

				if (transpiled.map) {
					result.map = new SourceMap(transpiled.map);
				}
			} else {
				throw new Error(
					`Babel Compile Error: Failed to compile ${asset.source}`
				);
			}
		}

		return result;
	}

	public parse(asset: IAsset, bundler: Toypack) {
		if (typeof asset.content != "string") {
			let error = new Error("Babel Parse Error: Asset content must be string.");
			throw error;
		}

		let result: ParsedAsset = {
			dependencies: [],
			metadata: {},
		};

		if (!asset.isObscure) {
			const AST = getAST(asset.content, {
				sourceType: "module",
				sourceFilename: asset.source,
				plugins: ["typescript", "jsx"],
			});

			// Replace "__esModule" identifiers to "__esModule_reserved" to avoid compile error.
			// Solves the case similar to https://github.com/evanw/esbuild/issues/1591
			const isCoreModule = /^\/node_modules\//.test(asset.source);
			if (isCoreModule && /__esModule/g.test(asset.content)) {
				traverse(AST, {
					Identifier({ node }) {
						if (node.name == "__esModule") {
							node.name = "__esModule_reserved";
						}
					},
				});
			}

			// Extract dependencies
			const imports = getModuleImports(AST);
			for (let dep of imports) {
				let isAdded = result.dependencies.some((d) => d === dep.id);

				if (!isAdded) {
					result.dependencies.push(dep.id);
				}
			}

			result.metadata.AST = AST;
		}

		return result;
	}
}
