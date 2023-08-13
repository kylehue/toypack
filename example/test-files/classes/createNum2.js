export function createNum(num) {
   return num;
}

export class Book {}

export const add = 123;

export default "Default expression!";

const test = 4;
export { test };
export const test1 = 23;

var defs = 123;
function go(defs_0, defs_1) {
   defs = 45;
}
var defs_2 = 123;
export { createNum as cnum };

function testing(defs_3) {
   defs = 23;
   console.log(defs_3);
}

export { bar as TEST } from "./createNum";