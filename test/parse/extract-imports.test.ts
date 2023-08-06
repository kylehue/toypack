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
   toypack.addOrUpdateAsset(
      "/module.js",
      `
      export const cat = "", dog = "";
      export function greet() {}
      export class Hunter {}
      export const id = "", boat = "";
      export { cat as "string name" };
      export const PI = 3.14;
      export default cat;
      `
   );
});

it("should extract imports", async () => {
   toypack.addOrUpdateAsset(
      "index.js",
      `
      import { cat } from "./module.js";
      import { dog as ear } from "./module.js";
      import { default as fat } from "./module.js";
      import { greet, Hunter } from "./module.js";
      import { id, boat as jar } from "./module.js";
      import { "string name" as keep } from "./module.js";
      import { PI } from "./module.js";
      `
   );

   const graph: DependencyGraph = await getDependencyGraph.call(toypack);
   const module = graph.get("/index.js") as ScriptModule;
   const imports = module
      .getImports(["specifier"])
      .map((x) => x.specifier.local.name);
   expect(imports.sort()).toEqual(
      ["cat", "ear", "fat", "greet", "Hunter", "id", "jar", "keep", "PI"].sort()
   );
});

it("should extract default imports", async () => {
   toypack.addOrUpdateAsset(
      "index.js",
      `
      import ant from "./module.js";
      `
   );

   const graph: DependencyGraph = await getDependencyGraph.call(toypack);
   const module = graph.get("/index.js") as ScriptModule;
   const imports = module
      .getImports(["default"])
      .map((x) => x.specifier.local.name);
   expect(imports).toEqual(["ant"]);
});

it("should extract namespace imports", async () => {
   toypack.addOrUpdateAsset(
      "index.js",
      `
      import * as namespace from "./module.js";
      import * as _namespace from "./module.js";
      `
   );

   const graph: DependencyGraph = await getDependencyGraph.call(toypack);
   const module = graph.get("/index.js") as ScriptModule;
   const imports = module
      .getImports(["namespace"])
      .map((x) => x.specifier.local.name);
   expect(imports.sort()).toEqual(["namespace", "_namespace"].sort());
});

it("should extract side-effect imports", async () => {
   toypack.addOrUpdateAsset(
      "index.js",
      `
      import "./module.js";
      `
   );

   const graph: DependencyGraph = await getDependencyGraph.call(toypack);
   const module = graph.get("/index.js") as ScriptModule;
   const imports = module.getImports(["sideEffect"]);
   expect(imports.length).toEqual(1);
});

it("should extract dynamic imports", async () => {
   toypack.addOrUpdateAsset(
      "index.js",
      `
      import("./module.js");
      `
   );

   const graph: DependencyGraph = await getDependencyGraph.call(toypack);
   const module = graph.get("/index.js") as ScriptModule;
   const imports = module.getImports(["dynamic"]);
   expect(imports.length).toEqual(1);
});