const { default: Toypack } = require("@toypack/core/Toypack");
const path = require("path-browserify");
const toypack = new Toypack();

toypack.defineOptions({
   bundleOptions: {
      entry: "src/main.js",
      resolve: {
         alias: {
            "@utils": "/test/utils/",
            react: "reactlib",
            "react-dom": "reactlib-dom",
            "react/css": "/node_modules/reactlib/test/hello.css",
         },
      },
   },
});

beforeAll(async () => {
   await toypack.addAsset("src/main.js");
   await toypack.addAsset("assets/image.jpg");
   await toypack.addAsset("someFile.js");
   await toypack.addAsset("someFolder/file.js");
   await toypack.addAsset(
      "someFolder/package.json",
      JSON.stringify({
         main: "file.js",
      })
   );
   await toypack.addAsset("anotherFolder/index.js");
   await toypack.addAsset("node_modules/hello/index.js");
   await toypack.addAsset("test/utils/tester/index.js");
   await toypack.addAsset("test/utils/tester/stuff.js");
   await toypack.addAsset("test/utils/foo/bar.js");
   await toypack.addAsset("node_modules/reactlib/index.js");
   await toypack.addAsset("node_modules/reactlib/test/hello.css");
   await toypack.addAsset("node_modules/reactlib-dom/index.js");
   await toypack.addAsset("node_modules/reactlib-dom/test/hello.css");
});

describe("Resolve", () => {
   test("Simple", async () => {
      let res = await toypack.resolve("./src/main.js", {
         baseDir: ".",
      });

      let expected = path.normalize("/src/main.js");

      expect(res).toBe(expected);

      let noExtensions = await toypack.resolve("./src/main.js", {
         baseDir: ".",
         extensions: [],
      });

      expect(noExtensions).not.toBe(expected);
   });

   test("baseDir", async () => {
      let res = await toypack.resolve("../assets/image.jpg", {
         baseDir: path.dirname("src/main.js"),
      });

      expect(res).toBe(path.normalize("/assets/image.jpg"));

      let res2 = await toypack.resolve("./src/main.js", {
         baseDir: "src",
      });

      expect(res2).not.toBe(path.normalize("/src/main.js"));
   });

   test("Directories", async () => {
      let res = await toypack.resolve("./someFolder", {
         baseDir: ".",
      });

      expect(res).toBe(path.normalize("/someFolder/file.js"));

      let res2 = await toypack.resolve("./anotherFolder", {
         baseDir: ".",
      });

      expect(res2).toBe(path.normalize("/anotherFolder/index.js"));
   });

   test("Alias", async () => {
      let res = await toypack.resolve("@utils/foo/bar");
      expect(res).toBe(path.normalize("/test/utils/foo/bar.js"));

      let res2 = await toypack.resolve("@utils/tester");
      expect(res2).toBe(path.normalize("/test/utils/tester/index.js"));

      let res3 = await toypack.resolve("react/test/hello.css");
      expect(res3).toBe(
         path.normalize("/node_modules/reactlib/test/hello.css")
      );

      let res4 = await toypack.resolve("react");
      expect(res4).toBe(path.normalize("/node_modules/reactlib/index.js"));

      let res5 = await toypack.resolve("react-dom/test/hello.css");
      expect(res5).toBe(
         path.normalize("/node_modules/reactlib-dom/test/hello.css")
      );

      let res6 = await toypack.resolve("react-dom");
      expect(res6).toBe(path.normalize("/node_modules/reactlib-dom/index.js"));

      let res7 = await toypack.resolve("react/css");
      expect(res7).toBe(
         path.normalize("/node_modules/reactlib/test/hello.css")
      );
   });

   test("Core modules", async () => {
      let res = await toypack.resolve("hello", {
         baseDir: ".",
      });

      let expected = path.normalize("/node_modules/hello/index.js");

      expect(res).toBe(expected);

      let excludeCoreModules = await toypack.resolve("hello", {
         baseDir: ".",
         includeCoreModules: false,
      });

      expect(excludeCoreModules).not.toBe(expected);
   });

   test("External URLs", async () => {
      let res = await toypack.resolve(
         "https://cdnjs.cloudflare.com/ajax/libs/canvas-confetti/1.6.0/confetti.min.js"
      );

      expect(res).toBe(
         "https://cdnjs.cloudflare.com/ajax/libs/canvas-confetti/1.6.0/confetti.min.js"
      );
   });
});