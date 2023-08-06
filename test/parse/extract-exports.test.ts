/**
 * @vitest-environment jsdom
 */

import { expect, it, beforeEach } from "vitest";
import { Toypack } from "../../build/Toypack";
import { DependencyGraph, getDependencyGraph } from "../../src/parse";
import { ScriptModule } from "../../src/types";
const toypack = new Toypack();

beforeEach(() => {
   toypack.clearAssets();
});

it("should extract declared", async () => {
   toypack.addOrUpdateAsset(
      "index.js",
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
      const o2 = {
         foo: [["🐶", "🎈"], "🌉"],
         bar: {tick: [{tock: "eleven!"}]}
      }
      export const {
         foo: [[puppy, balloon], bridge],
         bar: {tick: [{tock: eleven}]}
      } = o2;
      `
   );

   const graph: DependencyGraph = await getDependencyGraph.call(toypack);
   const module = graph.get("/index.js") as ScriptModule;
   const exports = module.getExports(["declared"]).map((x) => x.name);
   expect(exports.sort()).toEqual(
      [
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
         "puppy",
         "bridge",
         "balloon",
         "eleven",
      ].sort()
   );
});

it("should extract referenced", async () => {
   toypack.addOrUpdateAsset(
      "index.js",
      `
      const map = {};
      const noop = {};
      export { map, noop };
      export { map as foo, noop as bar };
      export { map as "string name" };
      export { map as default };
      `
   );

   const graph: DependencyGraph = await getDependencyGraph.call(toypack);
   const module = graph.get("/index.js") as ScriptModule;
   const exports = module.getExports(["declared"]).map((x) => x.name);
   expect(exports.sort()).toEqual(
      ["map", "noop", "foo", "bar", "string name", "default"].sort()
   );
});

it("should extract aggregated", async () => {
   toypack.addOrUpdateAsset(
      "index.js",
      `
      export * from "./module.js";
      export * as orca from "./module.js";
      export { paddle, quartz } from "./module.js";
      export { import1 as robot, import2 as sand } from "./module.js";
      export { default } from "./module.js";
      export { default as tavern } from "./module.js";
      `
   );
   toypack.addOrUpdateAsset(
      "/module.js",
      `
      export const paddle = "", quartz = "";
      export const import1 = "", import2 = "";
      export default paddle;
      `
   );

   const graph: DependencyGraph = await getDependencyGraph.call(toypack);
   const module = graph.get("/index.js") as ScriptModule;
   const exports = module
      .getExports(["aggregatedNamespace", "aggregatedName"])
      .map((x) => x.name);
   expect(exports.sort()).toEqual(
      ["default", "orca", "paddle", "quartz", "robot", "sand", "tavern"].sort()
   );
   expect(module.getExports(["aggregatedAll"])[0].source).toEqual(
      "./module.js"
   );
});
