const sampleFiles: Record<string, { source: string; content: string }> = {};

function addFile(source: string, content = "") {
   sampleFiles[source] = {
      source,
      content,
   };
}

// ESM
addFile(
   "index.ts",
   `
console.log(123456);
`
);

addFile(
   "src/main.ts",
   `
//import path from "path-browserify?raw&test=1";
//console.log(path.join("src", "classes"));
import {adder} from "@classes/adder?test";
console.log(adder(4,6));
import pkgjson from "../package.json";
console.log(pkgjson);
import path from "path";
console.log(path);
const foo: string = "bar";
console.log(foo);
export const test = 452;
`
);

addFile(
   "classes/adder.js",
   `
import "../styles/sample.scss";
import {createNum as cool} from "./createNum.js";
import {test} from "../src/main";
console.log(test);
export function adder(numA, numB) {
   return cool(numA) + cool(numB);
}
`
);

addFile(
   "classes/createNum.js",
   `
export * from "./createNum2.js";
`
);

addFile(
   "classes/createNum2.js",
   `
export function createNum(num) {
   return num;
}
`
);

addFile("package.json", JSON.stringify({
   main: "/src/main",
   test: 123,
   dependencies: {
      foo: "bar"
   }
}));

addFile(
   "node_modules/path-browserify/index.js",
   `
console.log("path-browserify test");
`
);

/* addFile(
   "styles/sample.css",
   `
body {
   background: yellow;
}
`
); */

addFile(
   "styles/sample.scss",
   `
{
   "background": "yellow"
}
`
);

// CJS
/* addFile(
   "src/main.js",
   `
const path = require("path-browserify");
console.log(path.join("src", "classes"));
const {adder} = require("../classes/adder?test");
console.log(adder(4,6));
`
);

addFile(
   "classes/adder.js",
   `
const createNum = require("./createNum.js").createNum;
exports.adder = function(numA, numB) {
   return createNum(numA) + createNum(numB);
}
`
);

addFile(
   "classes/createNum.js",
   `
exports.createNum = function(num) {
   return num;
}
`
);

addFile(
   "node_modules/path-browserify/index.js",
   `
console.log("path-browserify test");
`
); */

export { sampleFiles };
