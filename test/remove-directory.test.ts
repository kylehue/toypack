/**
 * @vitest-environment jsdom
 */

import { expect, it, beforeEach } from "vitest";
import { Toypack } from "..";

const toypack = new Toypack();

beforeEach(async () => {
   toypack.clearAssets();
   toypack.addOrUpdateAsset("/src/index.js", "");
   toypack.addOrUpdateAsset("/src/classes/Book.js", "");
   toypack.addOrUpdateAsset("/src/classes/Author.js", "");
});

it("should clear", () => {
   toypack.removeDirectory("/");
   expect(toypack.getAsset("/src/index.js")).toBeFalsy();
   expect(toypack.getAsset("/src/classes/Book.js")).toBeFalsy();
   expect(toypack.getAsset("/src/classes/Author.js")).toBeFalsy();
});

it("should remove directory", () => {
   toypack.removeDirectory("/src/classes");
   expect(toypack.getAsset("/src/index.js")).toBeTruthy();
   expect(toypack.getAsset("/src/classes/Book.js")).toBeFalsy();
   expect(toypack.getAsset("/src/classes/Author.js")).toBeFalsy();
});

it("should only remove directories", () => {
   toypack.removeDirectory("/src/index.js");
   expect(toypack.getAsset("/src/index.js")).toBeTruthy();
   expect(toypack.getAsset("/src/classes/Book.js")).toBeTruthy();
   expect(toypack.getAsset("/src/classes/Author.js")).toBeTruthy();
});