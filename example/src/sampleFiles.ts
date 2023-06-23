export const sampleFiles: Record<string, string | Blob> = {
   /* base */
   "package.json": (await import("@test/package.json?raw")).default,
   "index.html": (await import("@test/index.html?raw")).default,
   "src/main.ts": (await import("@test/src/main.ts?raw")).default,
   "src/App.vue": (await import("@test/src/App.vue?raw")).default,
   "src/testing.cjs": (await import("@test/src/testing.cjs?raw")).default,
   "src/testing.mjs": (await import("@test/src/testing.mjs?raw")).default,
   "classes/adder.js": (await import("@test/classes/adder.js?raw")).default,
   "classes/createNum.js": (await import("@test/classes/createNum.js?raw"))
      .default,
   "classes/createNum2.js": (await import("@test/classes/createNum2.js?raw"))
      .default,
   "styles/sample.css": (await import("@test/styles/sample.css?raw")).default,
   /* node_modules */
   "node_modules/path-browserify/index.js": (
      await import("@test/nm/path-browserify/index.js?raw")
   ).default,
   "node_modules/testing/index.js": (
      await import("@test/nm/testing/index.js?raw")
   ).default,
   /* resources */
   "images/cat.png": await (
      await fetch(new URL("@test/images/cat.png", import.meta.url).href)
   ).blob(),
   "images/kitty-cat-sandwich.gif": await (
      await fetch(
         new URL("@test/images/kitty-cat-sandwich.gif", import.meta.url).href
      )
   ).blob(),
};
