// @ts-nocheck
/* Package related tests */
// import "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.min.css";
// // import "bootstrap-icons/font/bootstrap-icons.min.css";
// import "../react";
// import "../vue";
// import confetti from "canvas-confetti";
// const meowButton = document.getElementById<HTMLButtonElement>("meow")!;
// meowButton.onclick = () => confetti();
// import * as Vue from "vue";
// console.log(Vue);

/* Bundler test */
// import pkgjson from "../package";
// console.log(pkgjson);
// const foo: string = "bar";
// console.log(foo);
// import { adder } from "@classes/adder?test";
// console.log(adder(4, 6));
// const bingbong = "beepboop";
// console.log(bingbong);
// import "../styles/sample.css";
// export const fourFiveTwo = 452;

// (async () => {
//    const test = await import("../index.html?raw");
//    console.log(test);
// })();

/* CJS */
// require("../react");
// const confetti = require("https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/+esm").default;
// const meowButton = document.getElementById<HTMLButtonElement>("meow")!;
// meowButton.onclick = () => confetti();

/* named exports */
// export const candy = "🍬";
// export function myFunction() {
//    console.log(candy);
// }

// /* default exports */
// export default function () {
//    console.log(candy);
// }
// export default class {
//    constructor() {
//       console.log(candy);
//    }
// }
// const greet = "Good morning!";
// export default greet;
// Exporting declarations

const o = {
   ant: "a",
   boat: "b",
};

const array = ["foo", "bar"];

export var cat, dog;
export var ear = 1, fat = 2;
export function greet() { /* … */ }
export class Hunter { /* … */ }
export function* id() { /* … */ }
export var { ant, "boat": jar } = o;
export var [keep, lone] = array;

// Export list
const PI = 3.14;
class Book {}
function getAuthor() {}
export { PI, Book, getAuthor };
export { PI as foo, Book as bar, getAuthor as author };
export { PI as "string name" };

// Default exports
export default {
   type: "object"
};
// export { PI as default };
// export default function functionName2() { /* … */ }
// export default class ClassName2 { /* … */ }
// export default function* generatorFunctionName2() { /* … */ }
// export default function () { /* … */ }
// export default class { /* … */ }
// export default function* () { /* … */ }
// const candy = "🍬";
// export default candy;

// // Aggregating modules
// export * from "./module.js";
// export * as orca from "./module.js";
// export { paddle, /* …, */ quartz } from "./module.js";
// export { import1 as robot, import2 as sand } from "./module.js";
// export { default, /* …, */ } from "./module.js";
// export { default as tavern } from "./module.js";