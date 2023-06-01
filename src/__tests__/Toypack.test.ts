/**
 * @vitest-environment jsdom
 */

import { describe, expect, test, beforeEach } from "vitest";
import { Toypack } from "../Toypack.js";

const toypack = new Toypack({
   bundleOptions: {
      entry: "src/main.js",
   },
});

beforeEach(() => {
   toypack.assets.clear();
})

describe("Export", () => {
   test("", () => {
      toypack.addOrUpdateAsset("", "");
   });
});

test("sample", () => {
   // Adding files
   toypack.addOrUpdateAsset(
      "test.js",
      `
export const test = "testing...";
`
   );

   toypack.addOrUpdateAsset(
      "src/main.js",
      `
import { test } from "../test.js";
console.log(test);
`
   );

   toypack.run();
});
