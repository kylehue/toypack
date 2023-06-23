import cool, * as path from "path-browserify";
import { resolve as res2 } from "path-browserify";
import { join as wow } from "testing";
export const test = 44;
export const script = "script";
console.log(path, cool, test, res2, script, wow);
window.test = test;
export default function () {
   console.log(123);
}