import cssRaw from "../styles/sample";
console.log(cssRaw);
import { createNum as cool } from "./createNum.js";
// import { test } from "../src/main";
// console.log(test);
export function adder(numA, numB) {
   return cool(numA) + cool(numB);
}
