/**
 * @vitest-environment jsdom
 */

import { expect, it, beforeEach } from "vitest";
import { getDependencyGraph, DependencyGraph } from "../../src/parse";
import { Toypack } from "../../build/Toypack";

const toypack = new Toypack();

toypack.addOrUpdateAsset(
   "/index.js",
   `
import * as module from "./module.js";
const foo = "";
const bar = "";
const createNamespace = "";
const moduleJs = "";
`
);

toypack.addOrUpdateAsset(
   "/module.js",
   `

import "./anotherModule.js";
const foo = "";
const [bar] = [1, 2];
`
);

toypack.addOrUpdateAsset(
   "/anotherModule.js",
   `
import "./module.js";
const foo = "";
const o = {
   a: 1,
   b: 2,
};
const { a: bar } = o;
`
);

const bundle = (await toypack.run()).js.content;

function getMatchCount(str: string, regex: RegExp) {
   return Array.from(str.matchAll(regex), (m) => m[0]).length;
}

it("should deconflict", () => {
   expect(getMatchCount(bundle, /\bfoo\b/g)).toEqual(1);
   expect(getMatchCount(bundle, /\bbar\b/g)).toEqual(1);
});

it("should deconflict runtime keys", () => {
   // 2 because + the call
   expect(getMatchCount(bundle, /\bcreateNamespace\b/g)).toEqual(2);
});

it("should deconflict namespaces", () => {
   expect(getMatchCount(bundle, /\bmoduleJs\b/g)).toEqual(1);
});