/**
 * @vitest-environment jsdom
 */

import { expect, it, beforeEach } from "vitest";
import { Toypack } from "..";

const toypack = new Toypack();

beforeEach(() => {
   toypack.clearAssets();
   toypack.resetConfig();
   toypack.addOrUpdateAsset("/index.js");
   toypack.addOrUpdateAsset("/src/a.js");
   toypack.addOrUpdateAsset("/src/foo/b.js");
   toypack.addOrUpdateAsset("/src/bar/c.js");
});

it("should move asset", () => {
   toypack.moveAsset("/index.js", "/src/index.js");
   expect(toypack.getAsset("/src/index.js")).toBeTruthy();
   expect(toypack.getAsset("/index.js")).toBeFalsy();
});

it("should move asset to root", () => {
   toypack.moveAsset("/src/a.js", "/a.js");
   expect(toypack.getAsset("/src/a.js")).toBeFalsy();
   expect(toypack.getAsset("/a.js")).toBeTruthy();
});

it("should move directory", () => {
   toypack.moveDirectory("/src", "/classes");
   expect(toypack.getAsset("/src/a.js")).toBeFalsy();
   expect(toypack.getAsset("/src/foo/b.js")).toBeFalsy();
   expect(toypack.getAsset("/src/bar/c.js")).toBeFalsy();
   expect(toypack.getAsset("/classes/a.js")).toBeTruthy();
   expect(toypack.getAsset("/classes/foo/b.js")).toBeTruthy();
   expect(toypack.getAsset("/classes/bar/c.js")).toBeTruthy();
});

it("should move directory to root", () => {
   toypack.moveDirectory("/src", "/");
   expect(toypack.getAsset("/src/a.js")).toBeFalsy();
   expect(toypack.getAsset("/src/foo/b.js")).toBeFalsy();
   expect(toypack.getAsset("/src/bar/c.js")).toBeFalsy();
   expect(toypack.getAsset("/a.js")).toBeTruthy();
   expect(toypack.getAsset("/foo/b.js")).toBeTruthy();
   expect(toypack.getAsset("/bar/c.js")).toBeTruthy();
});