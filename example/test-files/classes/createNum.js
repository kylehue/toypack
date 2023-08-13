const o = {
   foo: 1,
   bar: 2,
};
const adder = 123;
const _adder = 123;
import { AdderJs } from "../src/testing.mjs";
console.log(adder + _adder, AdderJs);

export const { foo, bar } = o;
export { o as "hello there" };
export default "DEFAULT_EXPORT_EXPRESSION";
