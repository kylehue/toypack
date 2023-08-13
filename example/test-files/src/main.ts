import "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.min.css";
// // import "bootstrap-icons/font/bootstrap-icons.min.css";
import "../react";
import "../vue";

import confetti from "canvas-confetti";
const meowButton = document.getElementById("meow")!;
meowButton.onclick = () => confetti();

/* Bundler test */
import adder, { dog, balloon, bay, eleven } from "../classes/adder";
console.log(adder, dog, balloon, bay, eleven);
import { foo as o, bar, "hello there" as test } from "../classes/createNum";
console.log(o, bar, test);
import counter, { AdderJs, dog as goodBoy } from "./testing.mjs";
console.log(counter, AdderJs, goodBoy);
import defs, {add} from "../classes/createNum2";
console.log(defs, add);
export default 123;
export { counter, AdderJs as Adder };
export { dog } from "./testing.mjs";
export * as NM from "../classes/createNum2";
export * from "../classes/createNum2";

export const red = 1, gold = 2;

const blue = 3;
const yellow = 4;

export { blue, yellow };


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