import {
	AssetInterface,
	ToypackLoader,
	ParsedAsset,
	CompiledAsset,
} from "@toypack/core/types";

import { parse as getAST } from "@babel/parser";
import { availablePlugins, transform } from "@babel/standalone";
import Toypack from "@toypack/core/Toypack";
import MagicString from "magic-string";

import { TransformOptions } from "@babel/core";
import { merge, cloneDeep } from "lodash";
import { getModuleImports } from "@toypack/utils";
import SourceMap from "@toypack/core/SourceMap";

const defaultTransformOptions: TransformOptions = {
	sourceType: "module",
	compact: false,
	presets: ["typescript", "react"],
	plugins: [availablePlugins["transform-modules-commonjs"]],
};

const defaultOptions: BabelLoaderOptions = {
	transformOptions: defaultTransformOptions,
	autoImportReactPragma: true,
};

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

	public compile(asset: AssetInterface, bundler: Toypack) {
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

			const transpiled = transform(asset.content, transformOptions);

			if (transpiled.code) {
				let chunk = new MagicString(transpiled.code);

				// Auto import react pragma
				if (
					this.options?.autoImportReactPragma &&
					/\.[jt]sx$/.test(asset.source) &&
					!asset.loaderData.parse?.metadata.isReactPragmaImported
				) {
					let isStrictMode = transpiled.code.startsWith(`"use strict";`);
					
					let index = 0;

					if (isStrictMode) {
						index += `"use strict";`.length;
					}

					chunk.prependRight(index ,`\nvar React = require("react");`);
				}

				result.content = chunk;
			}

			if (transpiled.map) {
				result.map = new SourceMap(transpiled.map);
			}
		}

		return result;
	}

	public parse(asset: AssetInterface, bundler: Toypack) {
		if (typeof asset.content != "string") {
			let error = new Error("Babel Parse Error: Asset content must be string.");
			throw error;
		}

		let result: ParsedAsset = {
			dependencies: [],
			metadata: {
				isReactPragmaImported: false,
			},
		};

		if (!asset.isObscure) {
			const AST = getAST(asset.content, {
				sourceType: "module",
				sourceFilename: asset.source,
				plugins: ["typescript", "jsx"],
			});

			const imports = getModuleImports(AST);

			for (let dep of imports) {
				let isAdded = result.dependencies.some((d) => d === dep.id);

				// Check if React pragma is already imported
				if (/\.[jt]sx$/.test(asset.source)) {
					if (dep.id == "react" && dep.specifiers.some((s) => s === "React")) {
						result.metadata.isReactPragmaImported = true;
					}
				}

				if (!isAdded) {
					result.dependencies.push(dep.id);
				}
			}
		}

		return result;
	}
}
