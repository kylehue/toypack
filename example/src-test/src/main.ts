// @ts-nocheck
// import path from "path-browserify?raw&test=1";
// console.log(path.join("src", "classes"));
// import path from "path";
// console.log(path);
//import "../index.html";
console.log(44);
console.log(3);
console.log(123456);
import pkgjson from "../package.json";
console.log(pkgjson);
const foo: string = "bar";
console.log(foo);
export const test = 452;
import { adder } from "@classes/adder?test";
console.log(adder(4, 6));
const bingbong = "beepboop";
console.log(bingbong);
import testing from "./testing.cjs";
console.log(testing);
// import mainRaw from "./main.ts?raw";
// console.log(mainRaw);
// import rawHTML from "../index.html?raw";
// console.log(rawHTML);

// (async () => {
//    const test = await import("../index.html?raw");
//    console.log(test);
// })();
