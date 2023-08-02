const numbers = [1, 2, 3, 4, 5];
// export * as Adder from "../classes/adder";
// import hiii, { dog as god, bay as yab, greet } from "../classes/adder";
// import defaultStrFromCreateNum from "../classes/createNum";
// console.log(hiii, /* god, */ yab, defaultStrFromCreateNum, greet);

// export default numbers;
export const dog = 45;
// export * as NM from "../classes/createNum2";


import { Book as coolBook, createNum } from "../classes/createNum2";
import * as Library from "../classes/createNum2";

export { coolBook as superCoolBook, createNum };
export default coolBook;
export { Library as coolLibrary };