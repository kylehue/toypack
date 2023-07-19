// import cat from "../images/cat.png";
// const img = document.createElement("img");
// img.src = cat;
// console.log(cat);
// document.body.append(img);

// export * from "./createNum2.js";

const o = {
   foo: 1,
   bar: 2,
};
const adder = 123;
const _adder = 123;
import { Adder } from "../src/testing.mjs";
console.log(adder + _adder/* , Adder */);

export const { foo, bar } = o;
export { o as "hello there"};
export default "DEFAULT_EXPORT_EXPRESSION";