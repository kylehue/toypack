/**
 * @vitest-environment jsdom
 */

import { expect, it, beforeEach } from "vitest";
import { Toypack } from "../..";
import { loadChunk } from "../../src/parse/load-chunk.js";

const unknownPath = "unknown.js";
const unknownContent = "console.log(null);";
const indexJsContent = `
import "${unknownPath}";
`;
const toypack = new Toypack();

toypack.usePlugin({
   name: "dummy-plugin",
   load: {
      order: "post",
      handler(dep) {
         if (/index\.js/.test(dep.source)) {
            return dep.content + "\nconsole.log('post');";
         }
      },
   },
});

toypack.usePlugin({
   name: "dummy-plugin",
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

toypack.usePlugin({
   name: "dummy-plugin",
   load: {
      handler(dep) {
         if (/index\.js/.test(dep.source)) {
            return dep.content + "\nconsole.log('hi');";
         }
      },
   },
});

toypack.usePlugin({
   name: "dummy-plugin",
   load: {
      order: "pre",
      handler(dep) {
         if (/index\.js/.test(dep.source)) {
            return dep.content + "\nconsole.log('pre');";
         }
      },
   },
});

beforeEach(async () => {
   toypack.clearAssets();
   toypack.addOrUpdateAsset("index.js", indexJsContent);
   await toypack.run();
});

it("should chain", async () => {
   const loaded = await loadChunk.call(toypack, "/index.js", true, {}, {});
   expect(loaded.content).toEqual(
      indexJsContent +
         "\nconsole.log('pre');" +
         "\nconsole.log('plugin');" +
         "\nconsole.log('hi');" +
         "\nconsole.log('post');"
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
   });
});

it("should create virtual module assets", () => {
   const unknownAsset = toypack.getAsset("virtual:" + unknownPath);
   expect(unknownAsset).toBeTruthy();
   expect(unknownAsset?.content).toEqual(unknownContent);
});
