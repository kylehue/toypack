/**
 * @vitest-environment jsdom
 */

import { expect, it } from "vitest";
import { extractImports } from "../../src/utils";
import { parseSync, TransformOptions } from "@babel/core";

const opts: TransformOptions = {
   parserOpts: {
      errorRecovery: true,
   },
};

const importsAst = parseSync(
   `
import ant from "./module.js";
import * as boat from "./module.js";
import { cat } from "./module.js";
import { dog as ear } from "./module.js";
import { default as fat } from "./module.js";
import { greet, Hunter } from "./module.js";
import { id, boat as jar, /* … */ } from "./module.js";
import { "string name" as keep } from "./module.js";
import lone, { PI, /* … */ } from "./module.js";
import Book, * as something from "./module.js";
`,
   opts
)!;

const importsAstExpectedExports = [
   "ant",
   "boat",
   "cat",
   "ear",
   "fat",
   "greet",
   "Hunter",
   "id",
   "jar",
   "keep",
   "lone",
   "PI",
   "Book",
   "something",
];

const sideEffectImportsAst = parseSync(
   `
import "./module0.js";
import "./module1.js";
import "./module2.js";
import "./module3.js";
import "./module4.js";
`,
   opts
)!;

const sideEffectImportsAstExpectedExports = [
   "0",
   "1",
   "2",
   "3",
   "4",
];


it("should extract imports", () => {
   expect(Object.keys(extractImports(importsAst)).sort()).toEqual(
      importsAstExpectedExports.sort()
   );
});

it("should extract side-effect imports", () => {
   expect(Object.keys(extractImports(sideEffectImportsAst)).sort()).toEqual(
      sideEffectImportsAstExpectedExports.sort()
   );
});