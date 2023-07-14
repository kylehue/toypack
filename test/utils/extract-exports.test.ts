/**
 * @vitest-environment jsdom
 */

import { expect, it } from "vitest";
import { extractExports } from "../../src/utils";
import { parseSync, TransformOptions } from "@babel/core";

const opts: TransformOptions = {
   parserOpts: {
      errorRecovery: true,
   },
};

const declaredAst = parseSync(
   `
const o = {
   ant: "a",
   boat: "b",
};
const array = ["foo", "bar"];
export var cat, dog;
export var ear = 1, fat = 2;
export function greet() { /* … */ }
export class Hunter { /* … */ }
export function* id() { /* … */ }
export var { ant, "boat": jar } = o;
export var [keep, lone] = array;
`,
   opts
)!;

const declaredAstExpectedExports = [
   "cat",
   "dog",
   "ear",
   "fat",
   "greet",
   "Hunter",
   "id",
   "ant",
   "jar",
   "keep",
   "lone",
];

const referencedAst = parseSync(
   `
const map = {};
const noop = {};
export { map, noop };
export { map as foo, noop as bar };
export { map as "string name" };
export { map as default };
`,
   opts
)!;

const referencedAstExpectedExports = [
   "map",
   "noop",
   "foo",
   "bar",
   "string name",
   "default",
];

const defaultsAst = parseSync(
   `
export default 23;
export default function functionName2() { /* … */ }
export default class ClassName2 { /* … */ }
export default function* generatorFunctionName2() { /* … */ }
export default function () { /* … */ }
export default class { /* … */ }
export default function* () { /* … */ }
const candy = "🍬";
export default candy;
`,
   opts
)!;

const defaultsAstExpectedExports = ["default"];

const aggregatedAst = parseSync(
   `
export * from "./module.js";
export * as orca from "./module.js";
export { paddle, quartz } from "./module.js";
export { import1 as robot, import2 as sand } from "./module.js";
export { default } from "./module.js";
export { default as tavern } from "./module.js";
`,
   opts
)!;

const aggregatedAstExpectedExports = [
   "default",
   "orca",
   "paddle",
   "quartz",
   "robot",
   "sand",
   "tavern",
];

it("should extract declared", () => {
   expect(Object.keys(extractExports(declaredAst)).sort()).toEqual(
      declaredAstExpectedExports.sort()
   );
});

it("should extract referenced", () => {
   expect(Object.keys(extractExports(referencedAst)).sort()).toEqual(
      referencedAstExpectedExports.sort()
   );
});

it("should extract default", () => {
   expect(Object.keys(extractExports(defaultsAst)).sort()).toEqual(
      defaultsAstExpectedExports.sort()
   );
});

it("should extract aggregated", () => {
   expect(Object.keys(extractExports(aggregatedAst)).sort()).toEqual(
      aggregatedAstExpectedExports.sort()
   );
});
