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
const _o = 123;
const adder = 123;
var _adder = 123;

if (true) {
   const [_adder] = [2];
   console.log(_adder);
}
for (let i = 0; i != 0; i++) {}
export function greet() {
   const _adder = 45;
   return _adder;
}
// export default function adad(a, b) {
//    return a + b + foo + sum_default + _o + adder + _adder;
// }

export default {
   foo,
   sum_default,
   _o,
   adder,
   _adder,
};

const o = {
   foo: [["🐶", "🎈"], "🌉"],
   bar: {tick: [{tock: "eleven!"}]}
}

export const {
   foo: [[dog, balloon], bay],
   bar: {tick: [{tock: eleven}]}
} = o;