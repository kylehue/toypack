const foo = 123;
const sum_default = 123;
const _o = 123;
const adder = 123;
var _adder = 123;

if (true) {
   const adder = [2];
   console.log(adder);
}

for (var i = 0; i != 0; i++) {}

export function sayHello() {
   console.log("Hello!");
}

export function greet() {
   var _adder = 45;
   sayHello();
   return _adder;
}

export default function (a, b) {
   return a + b + foo + sum_default + _o + adder + _adder;
}

const o = {
   foo: [["🐶", "🎈"], "🌉"],
   bar: { tick: [{ tock: "eleven!" }] },
};

export const {
   foo: [[dog, balloon], bay],
   bar: {
      tick: [{ tock: eleven }],
   },
} = o;

import defExp from "./createNum2";
console.log(defExp);

export * as createNum2Js from "./createNum2";
