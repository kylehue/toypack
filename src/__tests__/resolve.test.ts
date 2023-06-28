/**
 * @vitest-environment jsdom
 */

import path from "path-browserify";
import { expect, it, beforeAll } from "vitest";
import { Toypack } from "../Toypack.js";

const toypack = new Toypack({
   bundle: {
      entry: "src/main.js",
      resolve: {
         alias: {
            "@utils": "/test/utils/",
            react: "reactlib",
            "react-dom": "reactlib-dom",
            "react/css": "/node_modules/reactlib/test/hello.css",
            "../local": "/assets/image.jpg",
         },
         fallback: {
            path: false,
            assert: "assert-browserify",
         },
      },
   },
});

beforeAll(() => {
   toypack.clearAsset();
   toypack.addOrUpdateAsset("local/index.js");
   toypack.addOrUpdateAsset("src/main.js");
   toypack.addOrUpdateAsset("assets/image.jpg");
   toypack.addOrUpdateAsset("someFile.js");
   toypack.addOrUpdateAsset("someFolder/file.js");
   toypack.addOrUpdateAsset(
      "someFolder/package.json",
      JSON.stringify({
         main: "file.js",
      })
   );
   toypack.addOrUpdateAsset("anotherFolder/index.js");
   toypack.addOrUpdateAsset("test/utils/tester/index.js");
   toypack.addOrUpdateAsset("test/utils/tester/stuff.js");
   toypack.addOrUpdateAsset("test/utils/foo/bar.js");
   toypack.addOrUpdateAsset("node_modules/hello/index.js");
   toypack.addOrUpdateAsset("node_modules/reactlib/index.js");
   toypack.addOrUpdateAsset("node_modules/reactlib/test/hello.css");
   toypack.addOrUpdateAsset("node_modules/reactlib-dom/index.js");
   toypack.addOrUpdateAsset("node_modules/reactlib-dom/test/hello.css");
});

it("should resolve", () => {
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
   expect(
      toypack.resolve("/assets/image.jpg", {
         baseDir: path.dirname("/src/main.js"),
      })
   ).toBe("/assets/image.jpg");

   expect(
      toypack.resolve("/assets/image", {
         baseDir: path.dirname("/src/main.js"),
      })
   ).toBe("/assets/image.jpg");
});

it("should resolve with base directory", () => {
   expect(
      toypack.resolve("../assets/image.jpg", {
         baseDir: "src",
      })
   ).toBe("/assets/image.jpg");

   expect(
      toypack.resolve("./src/main.js", {
         baseDir: "src",
      })
   ).not.toBe("/src/main.js");
});

it("should resolve folders", () => {
   expect(toypack.resolve("./someFolder")).toBe("/someFolder/file.js");

   expect(toypack.resolve("./anotherFolder")).toBe("/anotherFolder/index.js");
});

it("should resolve aliases", () => {
   expect(toypack.resolve("@utils/foo/bar")).toBe("/test/utils/foo/bar.js");

   expect(toypack.resolve("@utils/tester")).toBe("/test/utils/tester/index.js");

   expect(toypack.resolve("react/test/hello.css")).toBe(
      "/node_modules/reactlib/test/hello.css"
   );

   expect(toypack.resolve("react")).toBe("/node_modules/reactlib/index.js");

   expect(toypack.resolve("react-dom/test/hello.css")).toBe(
      "/node_modules/reactlib-dom/test/hello.css"
   );

   expect(toypack.resolve("react-dom")).toBe(
      "/node_modules/reactlib-dom/index.js"
   );

   expect(toypack.resolve("react/css")).toBe(
      "/node_modules/reactlib/test/hello.css"
   );

   expect(
      toypack.resolve("../local", {
         baseDir: path.dirname("/src/main.js"),
      })
   ).toBe("/assets/image.jpg");
});

it("should resolve fallback", () => {
   const expected = "/node_modules/assert-browserify/index.js";
   toypack.addOrUpdateAsset(expected);
   expect(toypack.resolve("assert")).toBe(expected);
   expect(toypack.resolve("path")).toBe("virtual:empty");
});

it("should resolve node_modules", () => {
   const expected = "/node_modules/hello/index.js";
   expect(toypack.resolve("hello")).toBe(expected);
   expect(
      toypack.resolve("hello", {
         baseDir: ".",
         includeCoreModules: false,
      })
   ).toBeNull();
});

it("should leave urls as it is", () => {
   expect(
      toypack.resolve(
         "https://cdnjs.cloudflare.com/ajax/libs/canvas-confetti/1.6.0/confetti.min.js"
      )
   ).toBe(
      "https://cdnjs.cloudflare.com/ajax/libs/canvas-confetti/1.6.0/confetti.min.js"
   );
});
