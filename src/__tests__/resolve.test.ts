/**
 * @vitest-environment jsdom
 */

import { expect, it, beforeEach } from "vitest";
import { Toypack } from "../Toypack.js";

const toypack = new Toypack();

beforeEach(() => {
   toypack.clearAssets();
   toypack.resetConfig();
});

it("should resolve", () => {
   toypack.addOrUpdateAsset("src/main.js");
   expect(
      toypack.resolve("./src/main.js", {
         baseDir: ".",
      })
   ).toBe("/src/main.js");
   expect(
      toypack.resolve("./src/main.js?raw&sample=2", {
         baseDir: ".",
      })
   ).toBe("/src/main.js");
});

it("should resolve absolute paths", () => {
   toypack.addOrUpdateAsset("assets/image.jpg");
   expect(
      toypack.resolve("/assets/image.jpg", {
         baseDir: "this/should/not/matter",
      })
   ).toEqual("/assets/image.jpg");
   expect(
      toypack.resolve("/assets/image", {
         baseDir: "this/should/not/matter",
      })
   ).toEqual("/assets/image.jpg");
});

it("should resolve with baseDir", () => {
   toypack.addOrUpdateAsset("assets/image.jpg");
   expect(
      toypack.resolve("../assets/image.jpg", {
         baseDir: "src",
      })
   ).toEqual("/assets/image.jpg");
   expect(
      toypack.resolve("../../../assets/image.jpg", {
         baseDir: "src/deep/even-deeper",
      })
   ).toEqual("/assets/image.jpg");
   toypack.addOrUpdateAsset("src/main.js");
   expect(
      toypack.resolve("./src/main.js", {
         baseDir: "src",
      })
   ).not.toEqual("/src/main.js");
});

it("should resolve folders", () => {
   toypack.addOrUpdateAsset("someFolder/index.js");
   expect(toypack.resolve("./someFolder")).toEqual("/someFolder/index.js");
   toypack.addOrUpdateAsset("anotherFolder/deep/file.js");
   toypack.addOrUpdateAsset(
      "anotherFolder/package.json",
      JSON.stringify({
         main: "./deep/file.js",
      })
   );
   expect(toypack.resolve("./anotherFolder")).toEqual(
      "/anotherFolder/deep/file.js"
   );
});

it("should resolve aliases", () => {
   toypack.setConfig({
      bundle: {
         resolve: {
            alias: {
               "@utils": "./test/utils/", // 1
               react: "reactlib", // 2
               "react-dom": "reactlib-dom", // 3
               "react/css": "/node_modules/reactlib/deep/foo.css", // 4
            },
         },
      },
   });
   // 1
   toypack.addOrUpdateAsset("/test/utils/getFoo.js");
   toypack.addOrUpdateAsset("/test/utils/deep/getBar.js");
   expect(toypack.resolve("@utils/getFoo")).toEqual("/test/utils/getFoo.js");
   expect(toypack.resolve("@utils/deep/getBar")).toEqual(
      "/test/utils/deep/getBar.js"
   );
   // 2
   toypack.addOrUpdateAsset("/node_modules/reactlib/index.js");
   toypack.addOrUpdateAsset("/node_modules/reactlib/deep/foo.css");
   expect(toypack.resolve("react")).toEqual("/node_modules/reactlib/index.js");
   expect(toypack.resolve("react/deep/foo")).toEqual(
      "/node_modules/reactlib/deep/foo.css"
   );
   // 3
   toypack.addOrUpdateAsset("/node_modules/reactlib-dom/index.js");
   toypack.addOrUpdateAsset("/node_modules/reactlib-dom/deep/foo.css");
   expect(toypack.resolve("react-dom")).toEqual(
      "/node_modules/reactlib-dom/index.js"
   );
   expect(toypack.resolve("react-dom/deep/foo")).toEqual(
      "/node_modules/reactlib-dom/deep/foo.css"
   );
   // 4
   expect(toypack.resolve("react/css")).toEqual(
      "/node_modules/reactlib/deep/foo.css"
   );
});

it("should resolve fallback", () => {
   toypack.setConfig({
      bundle: {
         resolve: {
            fallback: {
               "bad-module": "good-module",
               "another-bad-module": false,
            },
         },
      },
   });
   toypack.addOrUpdateAsset("/node_modules/good-module/index.js");
   expect(toypack.resolve("bad-module")).toBe(
      "/node_modules/good-module/index.js"
   );
   expect(toypack.resolve("another-bad-module")).toBe("virtual:empty");
});

it("should resolve node_modules", () => {
   toypack.addOrUpdateAsset("/node_modules/foo/index.js");
   expect(toypack.resolve("foo")).toEqual("/node_modules/foo/index.js");
   toypack.addOrUpdateAsset("/node_modules/bar/src/main.js");
   toypack.addOrUpdateAsset(
      "/node_modules/bar/package.json",
      JSON.stringify({
         main: "./src/main.js",
      })
   );
   expect(toypack.resolve("bar")).toEqual("/node_modules/bar/src/main.js");
});

it("should not resolve node_modules", () => {
   toypack.addOrUpdateAsset("/node_modules/foo/index.js");
   expect(toypack.resolve("foo", { includeCoreModules: false })).toBeNull();
   toypack.addOrUpdateAsset("/node_modules/bar/src/main.js");
   toypack.addOrUpdateAsset(
      "/node_modules/bar/package.json",
      JSON.stringify({
         main: "./src/main.js",
      })
   );
   expect(toypack.resolve("bar", { includeCoreModules: false })).toBeNull();
});

it("should leave urls as it is", () => {
   expect(
      toypack.resolve(
         "https://cdnjs.cloudflare.com/ajax/libs/canvas-confetti/1.6.0/confetti.min.js"
      )
   ).toBe(
      "https://cdnjs.cloudflare.com/ajax/libs/canvas-confetti/1.6.0/confetti.min.js"
   );
   expect(
      toypack.resolve(
         "data:text/javascript;base64,ZXhwb3J0IGRlZmF1bHQgT2JqZWN0LmFzc2lnbg=="
      )
   ).toBe(
      "data:text/javascript;base64,ZXhwb3J0IGRlZmF1bHQgT2JqZWN0LmFzc2lnbg=="
   );
});

it("should map extension alias", () => {
   toypack.setConfig({
      bundle: {
         resolve: {
            extensionAlias: {
               ".test": [".bar", ".foo", ".test"],
            },
         },
      },
   });
   toypack.addOrUpdateAsset("/foo/bar.foo");
   toypack.addOrUpdateAsset("/foo/bar.bar");
   // `.bar` is the first one the the alias array so it should be the result
   expect(toypack.resolve("/foo/bar.test")).toBe("/foo/bar.bar");
});

it("should resolve virtual baseDir", () => {
   toypack.addOrUpdateAsset("src/main.js");
   toypack.addOrUpdateAsset("foo.js");
   expect(
      toypack.resolve("../foo.js", {
         baseDir: "virtual:/src/",
      })
   ).toBe("/foo.js");
});
