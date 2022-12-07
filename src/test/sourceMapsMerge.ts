import MagicString from "magic-string";
import { merge } from "@toypack/core/SourceMap";
import combine from "combine-source-map";
import convert from "convert-source-map";
import {
	transform as babelTransform,
	availablePlugins,
} from "@babel/standalone";
import * as babel from "@babel/standalone";
console.log(babel);

try {
	// prettier-ignore
	let esm =
	// prettier-ignore
`function random() {
   return Math.random();
}

function getRandomNumber(a, b) {
   console.log("min:", a);
   console.log("max:", b);
   return (random() * b) - a + b;
}

var gen = getRandomNumber(2, 5);
console.log(gen);
`;
	// Transformation #1
	// Transpile
	let esmTranspiled = babelTransform(esm, {
		presets: ["es2015-loose"],
		compact: true,
		sourceMaps: true,
		sourceFileName: "esm.babel.js",
		sourceType: "module",
	});

	// Map for transpiling
	let esmTranspiledMap = esmTranspiled.map;

	// Transformation #2
	// Minify
	let esmMinified = new MagicString(esmTranspiled.code);
	esmMinified.replaceAll("\n", " ");
	esmMinified.replaceAll("}", "};");

	// Map for minifying
	let esmMinifiedMap = esmMinified.generateMap({
		file: "esm.min.js",
		includeContent: true,
		hires: true
	});

	// Get results
	// Merge maps of both transformations
	let esmTranspiledMinifiedMap = merge(esmTranspiledMap, esmMinifiedMap);

	let bundle = esmMinified.toString() + esmTranspiledMinifiedMap.toComment();
	console.log(bundle);
	eval(bundle);
} catch (error) {
	console.error(error);
}
