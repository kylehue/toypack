/**
 * @vitest-environment jsdom
 */

import { expect, it } from "vitest";
import { Toypack } from "../../build/Toypack";
import { UidTracker } from "../../src/bundle-script/link/UidTracker";
import { UidGenerator } from "../../src/bundle-script/link/UidGenerator";
import { DependencyGraph, getDependencyGraph } from "../../src/parse";
import { ScriptModule } from "../../build/types";

const toypack = new Toypack();
const uidGenerator = new UidGenerator();
const uidTracker = new UidTracker(toypack, uidGenerator);

toypack.addOrUpdateAsset(
   "/index.js",
   `
import "./test1.js";

// Import exports
import theTavern from "./module.js";
export { theTavern as coolTavern };
export { theTavern };
import { getSomething1 as getSomethingOne } from "./module.js";
export { getSomethingOne };
export { getSomethingOne as goGetSomething };
import * as ModuleNamespace from "./module.js";
export { ModuleNamespace };
export { ModuleNamespace as TheModuleNamespace };

// Declared exports
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

toypack.addOrUpdateAsset(
   "test1.js",
   `
import { UUID, Bundle } from "./test2.js";
`
);
toypack.addOrUpdateAsset(
   "test2.js",
   `
export * from "magic-string";
export * as UUID from "uuid";
`
);

const graph: DependencyGraph = await getDependencyGraph.call(toypack);
const modules = Object.values(Object.fromEntries(graph)).filter((x) =>
   x.isScript()
) as ScriptModule[];
uidTracker.assignWithModules(modules);
uidGenerator.addReservedVars(...uidTracker.getAllNamespaces());

it("should have correct import exports", () => {
   const exports = uidTracker.getModuleExports("/index.js");

   expect(exports.get("getSomethingOne")).toEqual("getSomething");
   expect(exports.get("goGetSomething")).toEqual("getSomething");
   expect(exports.get("coolTavern")).toEqual(
      uidTracker.get("/module.js", "default")
   );
   expect(exports.get("theTavern")).toEqual(
      uidTracker.get("/module.js", "default")
   );
   expect(exports.get("ModuleNamespace")).toEqual(
      uidTracker.getNamespaceFor("/module.js")
   );
   expect(exports.get("TheModuleNamespace")).toEqual(
      uidTracker.getNamespaceFor("/module.js")
   );
});

it("should have correct basic exports", () => {
   const exports = uidTracker.getModuleExports("/index.js");

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

it("should have correct ids for external aggregated exports", () => {
   const exports = uidTracker.getModuleExports("/test2.js");
   expect(exports.get("magic-string")).toBeTypeOf("symbol");
   expect(exports.get("UUID")).toEqual(uidTracker.getNamespaceFor("uuid"));
});
