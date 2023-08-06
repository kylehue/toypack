/**
 * @vitest-environment jsdom
 */

import { expect, it } from "vitest";
import { Toypack } from "../../build/Toypack";

const toypack = new Toypack();

// @ts-ignore
const uidTracker = toypack._uidTracker;

toypack.addOrUpdateAsset(
   "/index.js",
   `
const o = {
   ant: "a",
   boat: "b",
};
const array = ["foo", "bar"];
export var cat = "🐱", dog = "🐶";
export var ear = "👂", fat = "🎅";
export function greet() {}
export class Hunter {}
export function* id() {}
export var { ant, "boat": jar } = o;
export var [keep, lone] = array;

// Export list
const PI = 3.14;
class Book {}
function getAuthor() {}
export { PI, Book, getAuthor };
export { PI as foo, Book as bar, getAuthor as author };
export { PI as "string name" };

// Default exports
const candy = "🍬";
export default candy;

// Aggregating modules
export * from "./module.js";
export * as orca from "./module.js";
export { import1 as robot, import2 as sand } from "./module.js";
export { default as tavern } from "./module.js";
   `
);

toypack.addOrUpdateAsset(
   "/module.js",
   `
export function getSomething() {}
export { getSomething as getSomething1 };
export { getSomething as getSomething2 };
export const paddle = "🏓";
export const quartz = "🌓";
export const import1 = "🤖";
export const import2 = "⌛";
const tavern = "🧝‍♀️";
export default tavern;
`
);

await toypack.run();

it("should have correct basic exports", () => {
   const exports = uidTracker.getModuleExports("/index.js");
   console.log(exports);
   
   // basics
   expect(exports.get("cat")).toEqual("cat");
   expect(exports.get("dog")).toEqual("dog");
   expect(exports.get("ear")).toEqual("ear");
   expect(exports.get("fat")).toEqual("fat");
   expect(exports.get("greet")).toEqual("greet");
   expect(exports.get("Hunter")).toEqual("Hunter");
   expect(exports.get("id")).toEqual("id");
   expect(exports.get("ant")).toEqual("ant");
   expect(exports.get("jar")).toEqual("jar");
   expect(exports.get("keep")).toEqual("keep");
   expect(exports.get("lone")).toEqual("lone");

   // aggregated
   expect(exports.get("paddle")).toEqual("paddle");
   expect(exports.get("quartz")).toEqual("quartz");
   expect(exports.get("import1")).toEqual("import1");
   expect(exports.get("import2")).toEqual("import2");

   // default
   expect(exports.get("default")).toEqual(
      uidTracker.get("/index.js", "default")
   );
   expect(exports.get("tavern")).toEqual(
      uidTracker.get("/module.js", "default")
   );
});

it("should have correct aliased exports", () => {
   const exports = uidTracker.getModuleExports("/index.js");
   // aliased
   expect(exports.get("PI")).toEqual("PI");
   expect(exports.get("foo")).toEqual("PI");
   expect(exports.get("string name")).toEqual("PI");
   expect(exports.get("Book")).toEqual("Book");
   expect(exports.get("bar")).toEqual("Book");
   expect(exports.get("getAuthor")).toEqual("getAuthor");
   expect(exports.get("author")).toEqual("getAuthor");

   // aggregated
   expect(exports.get("getSomething")).toEqual("getSomething");
   expect(exports.get("getSomething1")).toEqual("getSomething");
   expect(exports.get("getSomething2")).toEqual("getSomething");
   expect(exports.get("robot")).toEqual("import1");
   expect(exports.get("sand")).toEqual("import2");
});

it("should have correct namespace exports", () => {
   const exports = uidTracker.getModuleExports("/index.js");
   expect(exports.get("orca")).toEqual(
      uidTracker.getNamespaceFor("/module.js")
   );
});
