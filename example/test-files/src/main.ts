// @ts-nocheck
/* Package related tests */
// import "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.min.css";
// // import "bootstrap-icons/font/bootstrap-icons.min.css";
import "../react";
import "../vue";
// import * as Vue from "vue";
// console.log(Vue);
import confetti from "canvas-confetti";
const meowButton = document.getElementById("meow");
meowButton.onclick = () => confetti();

/* Bundler test */
import adder, { dog, balloon, bay, eleven } from "../classes/adder";
console.log(adder, dog, balloon, bay, eleven);
import { foo as o, bar, "hello there" as test } from "../classes/createNum";
console.log(o, bar, test);
import counter, { Adder, dog as goodBoy } from "./testing.mjs";
console.log(counter, Adder, goodBoy);
import defs, {add} from "../classes/createNum2";
console.log(defs, add);
export default 123;
export { counter, Adder };
export { dog } from "./testing.mjs";
export * as NM from "../classes/createNum2";
export * from "../classes/createNum2";

export const red = 1, gold = 2;

const blue = 3;
const yellow = 4;

export { blue, yellow };

// import isOdd from "is-odd";
// // import isOdd from "https://esm.sh/is-odd";
// import "../classes/createNum2";
// const defs = 45;
// const Book = 12;
// const add = 123;
// console.log(a, add, isOdd(3));

// export { isOdd };



// import {dog, superCoolBook, coolLibrary, createNum} from "./testing.mjs";
// console.log(dog, superCoolBook, coolLibrary, createNum);

// import defs from "./testing.mjs?raw";
// console.log(defs);



// import * as crpath from "path-browserify";

// const indexJs = 123;
// const pathBrowserify = 123;
// console.log(cpath, cresolve, crpath, indexJs);


// const def_0 = 45;
// const def_1 = 45;
// var cook = 45;
// console.log(def, add, createNum);

// export var foos = "foo", bars = "bar";
// export const [[hello, hi], hey] = [[1, 2], 3];
// const bingbong = "beepboop";
// console.log(bingbong);
// import "../styles/sample.css";
// export const fourFiveTwo = 452;

// (async () => {
//    const test = await import("../index.html?raw");
//    console.log(test);
// })();

// export default var a = 2;

/* Import test */
// import ant from "./module.js";
// import * as boat from "./module.js";
// import { cat } from "./module.js";
// import { dog as ear } from "./module.js";
// import { default as fat } from "./module.js";
// import { greet, Hunter } from "./module.js";
// import { id, boat as jar, /* … */ } from "./module.js";
// import { "string name" as keep } from "./module.js";
// import lone, { PI, /* … */ } from "./module.js";
// import Book, * as something from "./module.js";
// import "./module.js";

/* Export Test */
// const o = {
//    ant: "a",
//    boat: "b",
// };
// const array = ["foo", "bar"];
// export var cat = "🐱", dog = "🐶";
// export var ear = "👂", fat = "🎅";
// export function greet() {}
// export class Hunter {}
// export function* id() {}
// export var { ant, "boat": jar } = o;
// export var [keep, lone] = array;

// // Export list
// const PI = 3.14;
// class Book {}
// function getAuthor() {}
// export { PI, Book, getAuthor };
// export { PI as foo, Book as bar, getAuthor as author };
// export { PI as "string name" };

// // Default exports
// const candy = "🍬";
// export default candy;

// // Aggregating modules
// export * from "./module.js";
// export * as orca from "./module.js";
// export { import1 as robot, import2 as sand } from "./module.js";
// export { default as tavern } from "./module.js";