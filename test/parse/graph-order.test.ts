/**
 * @vitest-environment jsdom
 */

import { expect, it, beforeEach } from "vitest";
import { getDependencyGraph, DependencyGraph } from "../../src/parse";
import { Toypack } from "../../build/Toypack";

const toypack = new Toypack({
   bundle: {
      entry: "/A.js",
   },
});

beforeEach(() => {
   toypack.clearAssets();
});

it("should have proper order (simple)", async () => {
   toypack.addOrUpdateAsset(
      "A.js",
      `
      import "./B.js";
      import "./C.js";
      `
   );

   toypack.addOrUpdateAsset(
      "B.js",
      `
      import "./D.js";
      `
   );

   toypack.addOrUpdateAsset("C.js", ``);
   toypack.addOrUpdateAsset("D.js", ``);

   const graph: DependencyGraph = await getDependencyGraph.call(toypack);
   expect(Object.keys(Object.fromEntries(graph))).toEqual([
      "/A.js",
      "/C.js",
      "/B.js",
      "/D.js",
   ]);
});

it("should have proper order (complex)", async () => {
   toypack.addOrUpdateAsset(
      "A.js",
      `
      import "./F.js";
      import "./B.js";
      `
   );

   toypack.addOrUpdateAsset(
      "B.js",
      `
      import "./F.js";
      `
   );

   toypack.addOrUpdateAsset(
      "C.js",
      `
      import "./D.js";
      import "./E.js";
      `
   );

   toypack.addOrUpdateAsset(
      "D.js",
      `
      import "./E.js";
      `
   );

   toypack.addOrUpdateAsset("E.js", ``);

   toypack.addOrUpdateAsset(
      "F.js",
      `
      import "./C.js";
      import "./E.js";
      `
   );

   const graph: DependencyGraph = await getDependencyGraph.call(toypack);
   expect(Object.keys(Object.fromEntries(graph))).toEqual([
      "/A.js",
      "/B.js",
      "/F.js",
      "/C.js",
      "/D.js",
      "/E.js",
   ]);
});

it("should re-order", async () => {
   toypack.addOrUpdateAsset(
      "A.js",
      `
      import "./B.js";
      import "./C.js";
      `
   );

   toypack.addOrUpdateAsset("B.js", ``);
   toypack.addOrUpdateAsset("C.js", ``);

   const graph1: DependencyGraph = await getDependencyGraph.call(toypack);
   expect(Object.keys(Object.fromEntries(graph1))).toEqual([
      "/A.js",
      "/C.js",
      "/B.js",
   ]);

   /**
    * Originally, it should be A > C > B, but now that B imported C,
    * C should be last - resulting in A > B > C order.
    */
   toypack.addOrUpdateAsset(
      "B.js",
      `
      import "./C.js";
      `
   );

   const graph2: DependencyGraph = await getDependencyGraph.call(toypack);
   expect(Object.keys(Object.fromEntries(graph2))).toEqual([
      "/A.js",
      "/B.js",
      "/C.js",
   ]);
});

it("should re-order (with deps)", async () => {
   toypack.addOrUpdateAsset(
      "A.js",
      `
      import "./B.js";
      import "/node_modules/vue/index.js";
      `
   );

   toypack.addOrUpdateAsset(
      "B.js",
      `
      import "/node_modules/vue/index.js";
      `
   );

   toypack.addOrUpdateAsset(
      "/node_modules/vue/index.js",
      `
      import "/node_modules/vue/runtime-dom.js";
      `
   );

   toypack.addOrUpdateAsset(
      "/node_modules/vue/runtime-dom.js",
      `
      import "/node_modules/vue/runtime-core.js";
      import "/node_modules/vue/shared.js";
      `
   );
   toypack.addOrUpdateAsset(
      "/node_modules/vue/runtime-core.js",
      `
      import "/node_modules/vue/shared.js";
      `
   );
   toypack.addOrUpdateAsset("/node_modules/vue/shared.js", ``);

   const graph: DependencyGraph = await getDependencyGraph.call(toypack);

   expect(Object.keys(Object.fromEntries(graph))).toEqual([
      "/A.js",
      "/B.js",
      "/node_modules/vue/index.js",
      "/node_modules/vue/runtime-dom.js",
      "/node_modules/vue/runtime-core.js",
      "/node_modules/vue/shared.js",
   ]);
});
