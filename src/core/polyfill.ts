import MagicString from "magic-string";

export const POLYFILLS: any = {
	assert: "assert/",
	buffer: "buffer/",
	console: "console-browserify",
	constants: "constants-browserify",
	crypto: "crypto-browserify",
	domain: "domain-browser",
	events: "events/",
	http: "stream-http",
	https: "https-browserify",
	os: {
		package: "os-browserify",
		alias: "os-browserify/browser",
	},
	path: "path-browserify",
	punycode: "punycode/",
	process: {
		package: "process",
		alias: "process/browser",
	},
	querystring: "querystring-es3",
	stream: "stream-browserify",
	string_decoder: "string_decoder/",
	sys: "util/",
	timers: "timers-browserify",
	tty: "tty-browserify",
	url: "url/",
	util: "util/",
	vm: "vm-browserify",
	zlib: "browserify-zlib",
};

import { parse } from "@babel/parser";
import { transformFromAst } from "@babel/standalone";
import traverse from "@babel/traverse";

export default function polyfill(content: string, asset: any) {
	let AST = parse(content, {
		errorRecovery: true,
	});

	traverse(AST, {
		CallExpression: (dir: any) => {
			if (dir.node.callee.name == "require" && dir.node.arguments.length) {
				let id = dir.node.arguments[0].value;

            if (id in POLYFILLS) {
               let poly = POLYFILLS[id];

               if (typeof poly === "object") {
                  dir.node.arguments[0].value = poly.alias;
               } else {
                  dir.node.arguments[0].value = poly;
               }
				}
			}
		},
	});

	let back = transformFromAst(AST, content, {
		sourceMaps: true,
		sourceFileName: asset.id,
		compact: false,
		filename: asset.id,
   });

   return {
      content: back.code,
      map: back.map
   }
}
