/**
 * @vitest-environment jsdom
 */

import { expect, it, beforeEach } from "vitest";
import { Toypack } from "../..";
import { loadChunk } from "../../src/parse/load-chunk.js";
import { Loader } from "../../build/types.js";

const unknownPath = "unknown.js";
const unknownContent = "console.log(null);";
const indexJsContent = `
import "${unknownPath}";
`;
const toypack = new Toypack();

const dummyLoader: Loader = {
   test: /index\.js/g,
   compile(moduleInfo) {
      return moduleInfo.content + "\nconsole.log('loader');";
   },
};

const dummyLoader2: Loader = {
   test: /should not match/g,
   compile(moduleInfo) {
      return moduleInfo.content + "\nconsole.log('loader2');";
   },
};

toypack.usePlugin({
   name: "dummy-plugin",
   loaders: [dummyLoader, dummyLoader2],
   extensions: [["style", ".cba"]],
   resolve: {
      order: "pre",
      handler(id) {
         if (id == unknownPath) return "virtual:" + id;
      },
   },
   load: {
      order: "pre",
      handler(dep) {
         if (dep.source == "virtual:" + unknownPath) {
            return unknownContent;
         }

         if (dep.source == "/index.js") {
            return dep.content + "\nconsole.log('plugin');";
         }
      },
   },
});

beforeEach(async () => {
   toypack.clearAssets();
   toypack.addOrUpdateAsset("index.js", indexJsContent);
   await toypack.run();
});

it("should load", async () => {
   const loaded = await loadChunk.call(toypack, "/index.js", true, {}, {});
   expect(loaded.content).toEqual(
      indexJsContent + "\nconsole.log('plugin');" + "\nconsole.log('loader');"
   );
});

it("should not accept unknown extensions", async () => {
   toypack.addOrUpdateAsset("index.abc", "");
   await expect(
      loadChunk.call(toypack, "/index.abc", true, {}, {})
   ).rejects.toThrow(/Couldn't determine the type/gi);
});

it("should accept new extensions", async () => {
   const asset = toypack.addOrUpdateAsset("index.cba", "");
   const loaded = await loadChunk.call(toypack, "/index.cba", true, {}, {});
   expect(loaded).toEqual({
      type: "style",
      content: "",
      asset,
      lang: "cba",
   });
});

it("should create virtual module assets", () => {
   const unknownAsset = toypack.getAsset("virtual:" + unknownPath);
   expect(unknownAsset).toBeTruthy();
   expect(unknownAsset?.content).toEqual(unknownContent);
});
