// @ts-nocheck
// import path from "path-browserify?raw&test=1";
// console.log(path.join("src", "classes"));
// import path from "path";
// console.log(path);
import "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.min.css";
// import "bootstrap-icons/font/bootstrap-icons.min.css";
import "../react";
import "../vue";
import confetti from "canvas-confetti";
const meowButton = document.getElementById<HTMLButtonElement>("meow")!;
meowButton.onclick = () => confetti();
// import * as Vue from "vue";
// console.log(Vue);

import pkgjson from "../package";
console.log(pkgjson);
const foo: string = "bar";
console.log(foo);
import { adder } from "@classes/adder?test";
console.log(adder(4, 6));
const bingbong = "beepboop";
console.log(bingbong);
import "../styles/sample.css";
export const fourFiveTwo = 452;

(async () => {
   const test = await import("../index.html?raw");
   console.log(test);
})();

/* CJS */
// require("../react");
// const confetti = require("https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/+esm").default;
// const meowButton = document.getElementById<HTMLButtonElement>("meow")!;
// meowButton.onclick = () => confetti();