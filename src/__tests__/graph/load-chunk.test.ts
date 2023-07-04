/**
 * @vitest-environment jsdom
 */

import { expect, it, beforeEach } from "vitest";
import { Toypack } from "../../Toypack.js";
import { loadChunk } from "../../graph/load-chunk.js";
import { Loader, Plugin } from "src/types.js";
import { escapeRegex } from "../../utils/escape-regex.js";

const shouldNotLoadPath = "should.not.load.this.module";
const unknownPath = "unknown.js";
const unknownContent = "console.log(null);";
const indexJsContent = `
import "${unknownPath}";
import "${shouldNotLoadPath}";
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

function dummyPlugin(): Plugin {
   return {
      name: "dummy-plugin",
      loaders: [dummyLoader, dummyLoader2],
      extensions: [["style", ".cba"]],
      resolve(id) {
         if (id == unknownPath) return "virtual:" + id;
         if (id == shouldNotLoadPath) return "virtual:" + shouldNotLoadPath;
      },
      load(dep) {
         if (dep.source == "virtual:" + unknownPath) {
            return unknownContent;
         }

         if (dep.source == "/index.js") {
            return dep.content + "\nconsole.log('plugin');";
         }
      },
   };
}

toypack.usePlugin(dummyPlugin());

beforeEach(async () => {
   toypack.clearAsset();
   toypack.addOrUpdateAsset("index.js", indexJsContent);
   const errorRegex = new RegExp(escapeRegex(shouldNotLoadPath), "gi");
   await expect(toypack.run()).rejects.toThrow(errorRegex);
});

it("should load", async () => {
   const loaded = await loadChunk.call(toypack, "/index.js", true, {
      bundler: toypack,
      graph: {},
      importer: "",
   });

   expect(loaded.content).toEqual(
      indexJsContent + "\nconsole.log('plugin');" + "\nconsole.log('loader');"
   );
});

it("should not accept unknown extensions", async () => {
   toypack.addOrUpdateAsset("index.abc", "");
   await expect(
      loadChunk.call(toypack, "/index.abc", true, {
         bundler: toypack,
         graph: {},
         importer: "",
      })
   ).rejects.toThrow(/Couldn't determine the type/gi);
});

it("should accept new extensions", async () => {
   const asset = toypack.addOrUpdateAsset("index.cba", "");
   const loaded = await loadChunk.call(toypack, "/index.cba", true, {
      bundler: toypack,
      graph: {},
      importer: "",
   });
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
