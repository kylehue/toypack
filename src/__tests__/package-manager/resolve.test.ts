/**
 * @vitest-environment jsdom
 */

import path from "path-browserify";
import { expect, it, beforeAll } from "vitest";
import { resolve } from "../../package-manager/utils.js";

it("should work", () => {
   expect(
      resolve(
         "../jsx.d.ts",
         "https://esm.sh/v118/vue@3.3.4/dist/vue.d.mts",
         "https://esm.sh/"
      )
   ).toEqual("https://esm.sh/v118/vue@3.3.4/jsx.d.ts");

   expect(
      resolve(
         "/jsx.d.ts",
         "https://esm.sh/v118/vue@3.3.4/dist/vue.d.mts",
         "https://esm.sh/"
      )
   ).toEqual("https://esm.sh/jsx.d.ts");

   expect(
      resolve(
         "https://esm.sh/vue@3.3.4",
         "https://esm.sh/v118/vue@3.3.4/dist/vue.d.mts",
         "https://esm.sh/"
      )
   ).toEqual("https://esm.sh/vue@3.3.4");
});