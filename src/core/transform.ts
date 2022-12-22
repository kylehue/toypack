import {
	transform as babelTransform,
	availablePlugins,
} from "@babel/standalone";
import babelTraverse from "@babel/traverse";
import { parse as babelParse } from "@babel/parser";
import MagicString from "magic-string";
import { createSourceMap, merge, SourceMap } from "./SourceMap";
import Toypack from "./Toypack";
import { AssetInterface, CompiledAsset } from "./types";
import { cleanStr, isLocal, isURL, parsePackageName } from "@toypack/utils";
import { polyfills } from "./polyfills";
import { ParsedPackage } from "@toypack/utils/parsePackageName";

export interface ImportedModule {
	imported: string;
	name: string;
	parsed: ParsedPackage;
	usedVersion?: string;
}

export default function transform(
	chunk: MagicString,
	asset: AssetInterface,
	bundler: Toypack
) {
	let result: CompiledAsset = {
		content: {} as MagicString,
		metadata: {
			coreModules: [],
		},
	};

	// [1] - Transpile
	let transpiled = babelTransform(chunk.toString(), {
		sourceType: "module",
		sourceFileName: asset.source,
		filename: asset.source,
		sourceMaps: !!bundler.options.bundleOptions.output.sourceMap,
		compact: false,
		presets: ["typescript", "react"],
		plugins: [availablePlugins["transform-modules-commonjs"]],
	});

	// If transpile result is empty, return
	if (!transpiled.code) {
		result.content = new MagicString("");
		return result;
	}

	// Instantiate content and source map
	let chunkContent = new MagicString(transpiled.code);
	let chunkSourceMap = {} as SourceMap;
	if (transpiled.map) {
		let origSourceMap = chunk.generateMap({
			source: asset.source,
			includeContent: false,
			hires: bundler._sourceMapConfig[1] == "original",
		});

		let generatedSourceMap = transpiled.map;

		chunkSourceMap =
			createSourceMap(origSourceMap).mergeWith(generatedSourceMap);
	}

	let coreModules: any = [];

	// [2] - Replace requires & do polyfills
	// Parse
	let AST = babelParse(transpiled.code, {
		sourceType: "script",
		sourceFilename: asset.source,
		plugins: ["typescript", "jsx"],
		allowImportExportEverywhere: true,
	});

	babelTraverse(AST, {
		Identifier: ({ node }: any) => {
			// Replace identifiers that begins with `__toypack_` to something else to avoid identifier conflicts
			if (node.name.startsWith("__toypack_")) {
				chunkContent.update(
					node.start,
					node.end,
					node.name.replace("__toypack_", "__toypack_$_")
				);
			}
		},
		CallExpression: ({ node }: any) => {
			if (node.callee.name == "require" && node.arguments.length) {
				let id = node.arguments[0].value;

				let isCoreModule = !isLocal(id) && !isURL(id);
				let isAdded = coreModules.some((cm: any) => cm.imported === id);

				if (isCoreModule && !isAdded) {
					let name = `__toypack_dep_${cleanStr(id)}__`;

					if (id in polyfills) {
						id = polyfills[id];
						name = `__toypack_dep_${cleanStr(id)}__`;
						chunkContent.update(node.start, node.end, name);
					}

					chunkContent.update(node.start, node.end, name);

					let importedModule: ImportedModule = {
						imported: id,
						name,
						parsed: parsePackageName(id),
					};

					coreModules.push(importedModule);
				}
			}
		},
	});

	result.content = chunkContent;
	result.map = chunkSourceMap;
	result.metadata.coreModules = coreModules;

	return result;
}
