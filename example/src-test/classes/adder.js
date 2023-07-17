// import cssRaw from "../styles/sample";
// console.log(cssRaw);
// import { createNum as cool } from "./createNum.js";
// // import { test } from "../src/main";
// // console.log(test);
// function adder222(numA, numB) {
//    return cool(numA) + cool(numB);
// }

// console.log(adder222(2,5));

// export { adder222 as adder };
   
// export default adder222;

// console.log(Object.fromEntries(new URL(import.meta.url).searchParams.entries()));
// // console.log(import.meta.resolve("/hello!!"));
import str from "./createNum";
console.log(str);
const foo = 123;
const sum_default = 123;
const o = 123;
const adder = 123;
const _adder = 123;
export default function adad(a, b) {
   return a + b + foo + sum_default + o + adder + _adder;
}
export function greet() {
   return 45;
}
export const [dog, bay] = ["🐶", "🌉"];