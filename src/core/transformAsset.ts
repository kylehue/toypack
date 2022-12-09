import {
	transform as babelTransform,
	availablePlugins,
} from "@babel/standalone";
import { parse as babelParse } from "@babel/parser";
import babelTraverse from "@babel/traverse";
import MagicString from "magic-string";
import { Asset } from "@toypack/loaders/types";
import {
	generateFrom as createSourceMap
} from "@toypack/core/SourceMap";
import { isLocal, cleanStr } from "@toypack/utils";
import { BABEL_PARSE_DEFAULTS } from "@toypack/core/ToypackConfig";
import { POLYFILLS } from "@toypack/core/polyfill";
export default function transformAsset(content: string, asset: Asset) {
	console.log(`%c ${asset.id}`, "color: yellow;");
	// [1] - Transpile
	let transpiled = babelTransform(content, {
		sourceType: "module",
		sourceFileName: asset.id,
		filename: asset.id,
		sourceMaps: true,
		presets: ["typescript", "react"],
		plugins: [availablePlugins["transform-modules-commonjs"]],
	});

	// Instantiate content and source map
	let chunkContent = transpiled.code;
	let chunkMap = createSourceMap(transpiled.map);

	// Parse
	let AST = babelParse(chunkContent, {
		sourceType: "script",
		sourceFilename: asset.id,
		plugins: ["typescript", "jsx"],
		...BABEL_PARSE_DEFAULTS,
	});

	// [2] - Replace requires & polyfills
	let fixedChunk = new MagicString(chunkContent);
	let coreModules: any = [];

	babelTraverse(AST, {
		CallExpression: (dir: any) => {
			let node = dir.node;
			if (node.callee.name == "require" && node.arguments.length) {
				let id = node.arguments[0].value;

				if (
					!isLocal(id) &&
					!coreModules.some((cm: any) => cm.imported === id)
				) {
					let localId = `__toypack_dep_${cleanStr(id)}__`;

					if (id in POLYFILLS) {
						id = POLYFILLS[id];
						localId = `__toypack_dep_${cleanStr(id)}__`;
						fixedChunk.update(node.start, node.end, localId);
					} else {
						fixedChunk.update(node.start, node.end, localId);
					}

					coreModules.push({
						imported: id,
						localId,
					});
				}
			}
		},
	});

	chunkContent = fixedChunk.toString();
	let fixedChunkMap = fixedChunk.generateMap({
		file: asset.id,
		source: asset.id,
		includeContent: true,
		hires: true,
	});

	chunkMap.mergeTo(fixedChunkMap);

	let result = {
		content: chunkContent as string,
		map: chunkMap,
		coreModules,
	};

	console.log(`%c Core Modules: `, "color: green;");
	console.log(result);

	return result;
}
