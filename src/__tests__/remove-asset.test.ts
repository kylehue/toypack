/**
 * @vitest-environment jsdom
 */

import { expect, it, beforeEach } from "vitest";
import { Toypack } from "../Toypack.js";

const toypack = new Toypack({
   bundle: {
      entry: "/index.js",
      mode: "development",
   },
});

// @ts-ignore
const assets = toypack._assets;
// @ts-ignore
const virtualAssets = toypack._virtualAssets;
// @ts-ignore
const cache = toypack._cachedDeps;

const dummyVirtualModules = [
   "virtual:test1.js",
   "virtual:test2.js",
   "virtual:test3.js",
];

toypack.usePlugin({
   name: "dummy",
   load(dep) {
      if (dep.source == "/index.js") {
         return dummyVirtualModules.reduce((acc, cur) => {
            acc += `import "${cur}";\n`;
            return acc;
         }, "") + "\n" + dep.content;
      }

      // make the 3rd module's deps deeper
      if (dep.source == dummyVirtualModules[2]) {
         return `import "virtual:deep.js";`;
      }

      if (dep.source == "virtual:deep.js") {
         return `console.log("${dep.source}");`;
      }

      if (dummyVirtualModules.includes(dep.source)) {
         return `console.log("${dep.source}");`;
      }
   },
});

function getMapValues(map: Map<any, any>) {
   return Object.values(Object.fromEntries(map));
}

beforeEach(async () => {
   toypack.clearAssets();
   toypack.addOrUpdateAsset("/index.js", "");

   await toypack.run();
});

it("should be removed completely", () => {
   toypack.removeAsset("index.js");
   expect(getMapValues(assets).length).toBe(0);
   expect(getMapValues(virtualAssets).length).toBe(0);
   expect(getMapValues(cache.compiled).length).toBe(0);
   expect(getMapValues(cache.parsed).length).toBe(0);
});

it("should remove nothing", () => {
   const prevAssetCount = getMapValues(assets).length;
   const prevVirtualAssetsCount = getMapValues(virtualAssets).length;
   toypack.removeAsset("");
   toypack.removeAsset("/");
   toypack.removeAsset("index");
   const newAssetCount = getMapValues(assets).length;
   const newVirtualAssetsCount = getMapValues(virtualAssets).length;
   expect(newAssetCount).toEqual(prevAssetCount);
   expect(newVirtualAssetsCount).toEqual(prevVirtualAssetsCount);
});

it("should not remove if used by others", async () => {
   toypack.clearAssets();
   toypack.addOrUpdateAsset(
      "/sample.js",
      `import "${dummyVirtualModules[0]}";`
   );
   toypack.addOrUpdateAsset("/index.js", `import "./sample.js";`);
   await toypack.run();
   toypack.removeAsset("index.js");

   expect(toypack.getAsset("/sample.js")).toBeTruthy();
   expect(toypack.getAsset("virtual:test1.js")).toBeTruthy();

   // "/sample.js" and "virtual:test1.js" should stay
   expect(getMapValues(cache.compiled).length).toBe(2);
   expect(getMapValues(cache.parsed).length).toBe(2);
});