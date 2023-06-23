// @ts-nocheck
// import path from "path-browserify?raw&test=1";
// console.log(path.join("src", "classes"));
// import path from "path";
// console.log(path);
//import "../index.html";
import path, * as cool from "path-browserify";
import { resolve as res, join as wow } from "path-browserify";
import { test } from "./testing.mjs";
console.log(test);
console.log(path, cool, res, 44, test, wow);
window.test = test;
const script = 43770;
console.log(HTMLElement);

console.log(3);
console.log(123456);
import pkgjson from "../package";
console.log(pkgjson);
const foo: string = "bar";
console.log(foo);
import { adder } from "@classes/adder?test";
console.log(adder(4, 6));
const bingbong = "beepboop";
console.log(bingbong);
import App from "./App?raw";
console.log(App);
import css from "../styles/sample.css?raw";
import "../styles/sample.css";
console.log(css);
export const fourFiveTwo = 452;
import Appv from "./App";
console.log(Appv);

// import mainRaw from "./main.ts?raw";
// console.log(mainRaw);
// import rawHTML from "../index.html?raw";
// console.log(rawHTML);

// (async () => {
//    const test = await import("../index.html?raw");
//    console.log(test);
// })();
