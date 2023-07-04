/**
 * @vitest-environment jsdom
 */

import { expect, it, beforeEach } from "vitest";
import { Toypack } from "../Toypack.js";

const toypack = new Toypack({
   bundle: {
      entry: "/index.js",
      mode: "development"
   }
});

const cachedDeps = (toypack as any)._cachedDeps;
const assetsMap = (toypack as any)._assets;

beforeEach(async () => {
   toypack.clearAsset();
   toypack.addOrUpdateAsset("/index.js", "console.log(420);");
   toypack.addOrUpdateAsset("/foo/bar.js", `console.log("foo");`);
   await toypack.run();
});

it("should remove nothing", async () => {
   const prevAssetCount = Object.fromEntries(assetsMap);
   toypack.removeAsset("");
   toypack.removeAsset("index");
   toypack.removeAsset("foo/bar");
   expect(Object.fromEntries(assetsMap)).toEqual(prevAssetCount);
});

it("should remove from map", async () => {
   toypack.removeAsset("index.js");
   expect(assetsMap.get("/index.js")).toBeFalsy();
});

it("should remove from cache", async () => {
   toypack.removeAsset("index.js");

   expect(cachedDeps.parsed.get("/index.js.development")).toBeFalsy();
   expect(cachedDeps.compiled.get("/index.js.development")).toBeFalsy();
   expect(cachedDeps.parsed.get("/index.js.production")).toBeFalsy();
   expect(cachedDeps.compiled.get("/index.js.production")).toBeFalsy();
});