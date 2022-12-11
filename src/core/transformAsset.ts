import {
	transform as babelTransform,
	availablePlugins,
} from "@babel/standalone";
import { parse as babelParse } from "@babel/parser";
import babelTraverse from "@babel/traverse";
import MagicString from "magic-string";
import { Asset } from "@toypack/loaders/types";
import {
	createSourceMap as createSourceMap, SourceMapData
} from "@toypack/core/SourceMap";
import { isLocal, cleanStr, parsePackageStr, uuid, isURL } from "@toypack/utils";
import { BABEL_PARSE_DEFAULTS } from "@toypack/core/ToypackConfig";
import { POLYFILLS } from "@toypack/core/polyfill";
import { BUNDLE_CONFIG } from "./Toypack";
export default function transformAsset(content: string, source: string) {
	// [1] - Transpile
	let transpiled = babelTransform(content, {
		sourceType: "module",
		sourceFileName: source,
		filename: source,
		sourceMaps: true,
		compact: false,
		presets: ["typescript", "react"],
		plugins: [availablePlugins["transform-modules-commonjs"]]
	});

	// Instantiate content and source map
	let chunkContent = transpiled.code;

	let chunkMap = createSourceMap(transpiled.map);

	let fixedChunk = new MagicString(chunkContent);
	let coreModules: any = [];

	// [2] - Replace requires & do polyfills
	// Parse
	let AST = babelParse(chunkContent, {
		sourceType: "script",
		sourceFilename: source,
		plugins: ["typescript", "jsx"],
		...BABEL_PARSE_DEFAULTS,
	});

	babelTraverse(AST, {
		Identifier: ({node}:any) => {
			// Replace identifiers that begins with `__toypack_` to something else to avoid collisions
			if (node.name.startsWith("__toypack_")) {
				fixedChunk.update(
					node.start,
					node.end,
					node.name.replace("__toypack_", "__toypack_$_")
				);
			}
		},
		CallExpression: ({node}:any) => {
			if (node.callee.name == "require" && node.arguments.length) {
				let id = node.arguments[0].value;

				if (
					!isLocal(id) &&
					!isURL(id) &&
					!coreModules.some((cm: any) => cm.imported === id)
				) {
					let name = `__toypack_dep_${cleanStr(id)}__`;

					if (id in POLYFILLS) {
						id = POLYFILLS[id];
						name = `__toypack_dep_${cleanStr(id)}__`;
						fixedChunk.update(node.start, node.end, name);
					} else {
						fixedChunk.update(node.start, node.end, name);
					}

					coreModules.push({
						imported: id,
						name,
						parsed: parsePackageStr(id),
					});
				}
			}
		},
	});

	chunkContent = fixedChunk.toString();
	let fixedChunkMap = fixedChunk.generateMap({
		file: source,
		source: source,
		includeContent: true,
		hires: !BUNDLE_CONFIG.output.optimizeSourceMap,
	});

	chunkMap.mergeWith(fixedChunkMap);

	let result = {
		content: chunkContent as string,
		map: chunkMap,
		coreModules,
	};

	return result;
}
