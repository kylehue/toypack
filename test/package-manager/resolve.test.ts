/**
 * @vitest-environment jsdom
 */

import path from "path-browserify";
import { expect, it, beforeAll } from "vitest";
import { resolve } from "../../src/package-manager/utils";

it("should work with relative paths", () => {
   expect(
      resolve(
         "../jsx.d.ts",
         "https://esm.sh/v118/vue@3.3.4/dist/vue.d.mts"
      )
   ).toEqual("https://esm.sh/v118/vue@3.3.4/jsx.d.ts");
});

it("should work with root paths", () => {
   expect(
      resolve(
         "/jsx.d.ts",
         "https://esm.sh/v118/vue@3.3.4/dist/vue.d.mts",
      )
   ).toEqual("https://esm.sh/jsx.d.ts");
});

it("should work with url", () => {
   expect(
      resolve(
         "https://esm.sh/vue@3.3.4",
         "https://esm.sh/v118/vue@3.3.4/dist/vue.d.mts",
      )
   ).toEqual("https://esm.sh/vue@3.3.4");
});