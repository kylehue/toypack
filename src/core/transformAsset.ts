import {
	transform as babelTransform,
	availablePlugins,
} from "@babel/standalone";
import { parse as babelParse } from "@babel/parser";
import babelTraverse from "@babel/traverse";
import MagicString from "magic-string";
import { Asset } from "@toypack/loaders/types";
import {
	createSourceMap as createSourceMap,
	SourceMapData,
} from "@toypack/core/SourceMap";
import {
	isLocal,
	cleanStr,
	parsePackageStr,
	uuid,
	isURL,
} from "@toypack/utils";
import { BABEL_PARSE_DEFAULTS } from "@toypack/core/ToypackConfig";
import { POLYFILLS } from "@toypack/core/polyfill";
import { BUNDLE_CONFIG } from "./Toypack";

type TransformResult = {
	content: any;
	coreModules?: any;
	map?: SourceMapData | null;
};

function transformObscureAsset(content: string, source: string) {
	let result: TransformResult = {
		content: "",
	};

	result.content = new MagicString(
		content.replace(/__toypack_/g, "__toypack_$_")
	);

	return result;
}

function transformStandardAsset(content: string, source: string) {
	// [1] - Transpile
	let transpiled = babelTransform(content, {
		sourceType: "module",
		sourceFileName: source,
		filename: source,
		sourceMaps: !!BUNDLE_CONFIG.output.sourceMap,
		compact: false,
		presets: ["typescript", "react"],
		plugins: [availablePlugins["transform-modules-commonjs"]],
	});

	// Instantiate content and source map
	let chunkContent = transpiled.code;

	let chunkMap = BUNDLE_CONFIG.output.sourceMap
		? createSourceMap(transpiled.map)
		: null;

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
		Identifier: ({ node }: any) => {
			// Replace identifiers that begins with `__toypack_` to something else to avoid collisions
			if (node.name.startsWith("__toypack_")) {
				fixedChunk.update(
					node.start,
					node.end,
					node.name.replace("__toypack_", "__toypack_$_")
				);
			}
		},
		CallExpression: ({ node }: any) => {
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

	let result: TransformResult = {
		content: fixedChunk,
		map: chunkMap,
		coreModules,
	};

	return result;
}

export default function transformAsset(
	content: string,
	asset: Asset,
	options: any
) {
	let transformed;
	if (typeof asset.content == "string" && !isURL(asset.source)) {
		transformed = transformStandardAsset(content, asset.source);
	} else {
		transformed = transformObscureAsset(content, asset.source);
	}

	// UMD
	transformed.content.indent();
	transformed.content.prepend(`init: function(module, exports, require) {\n`);
	transformed.content.prepend(`${asset.id}: {\n`);
	transformed.content.append(`\n},`);
	transformed.content.append(
		`\nmap: ${JSON.stringify(asset.dependencyMap) || "{}"}`
	);
	transformed.content.append(`\n},`);

	let name = BUNDLE_CONFIG.output.name || "__toypack_library__";

	if (options.isFirst) {
		transformed.content.prepend(`
(function(root, factory) {
   if (typeof exports === "object" && typeof module === "object") {
      module.exports = factory();
   } else if (typeof define === "function" && define.amd) {
      define([], factory);
   } else if (typeof exports === "object") {
      exports["${name}"] = factory();
   } else {
      root["${name}"] = factory();
   }
})(self, function() {
   var __modules__ = {`);
	} else if (options.isLast) {
		transformed.content.append(`};
   /* Require function */
   const __moduleCache__ = {};
   function __require__(assetId) {
      const __asset__ = __modules__[assetId];
      if (!__asset__) throw new Error("Could not resolve " + assetId);
      const { init, map } = __asset__;
      const __module__ = { exports: {} };
      __moduleCache__[assetId] = __module__.exports;
      function localRequire(assetRelativePath) {
         if (!__moduleCache__[map[assetRelativePath]]) {
            __moduleCache__[map[assetRelativePath]] = __module__.exports;
            var __exports__ = __require__(map[assetRelativePath]);
            __moduleCache__[map[assetRelativePath]] = __exports__;
            return __exports__;
         }
         return __moduleCache__[map[assetRelativePath]];
      }
      init(__module__, __module__.exports, localRequire);
      return __module__.exports;
   }
   /* Start */
   return __require__(${options.entryId});
});
`);
	}

	return {
		content: transformed.content.toString(),
		map: transformed.map?.mergeWith(
			transformed.content.generateMap({
				file: asset.source,
				source: asset.source,
				includeContent: true,
				hires: true,
			})
		),
		coreModules: transformed.coreModules,
	};
}
