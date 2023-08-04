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

it.todo("add test for deconflict")

// it("", () => {
//    toypack.addOrUpdateAsset(
//       "A.js",
//       `
//       import { foo as anotherFoo } from "./B.js";

//       var foo = "foo";
      
//       `
//    );

//    toypack.addOrUpdateAsset(
//       "B.js",
//       `
//       var foo = "bar";
//       function hello(foo_0) {
//          foo;
//          foo_0 = 25;
//       }
//       hello();
//       export { foo };
//       `
//    );
// });
