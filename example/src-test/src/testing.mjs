const numbers =  [1, 2, 3, 4, 5];
export * as Adder from "../classes/adder";
import hiii, { dog as god, bay as yab, greet } from "../classes/adder";
import defaultStrFromCreateNum from "../classes/createNum";
console.log(hiii, /* god, */ yab, defaultStrFromCreateNum, greet);

export default numbers;