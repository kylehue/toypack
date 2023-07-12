/**
 * @vitest-environment jsdom
 */

import { expect, it } from "vitest";
import { shouldProduceSourceMap } from "../../src/utils";

it("should produce source map", () => {
   expect(shouldProduceSourceMap("/src/main.js", {})).toBe(true);
   expect(shouldProduceSourceMap("/src/main.js", true)).toBe(true);
   expect(
      shouldProduceSourceMap("/src/main.js", {
         include: ["/src/"],
         exclude: ["/src/main.js"],
      })
   ).toBe(true);
   expect(
      shouldProduceSourceMap("/src/main.js", {
         include: /\.js$/,
         exclude: /\.js$/,
      })
   ).toBe(true);
   expect(
      shouldProduceSourceMap("/src/main.js", {
         include: (source) => /\.js$/.test(source),
         exclude: (source) => /\.js$/.test(source),
      })
   ).toBe(true);
});

it("should not produce source map", () => {
   expect(shouldProduceSourceMap("/src/main.js", false)).toBe(false);
   expect(
      shouldProduceSourceMap("/src/main.js", {
         include: ["/test/"],
         exclude: ["/src/"]
      })
   ).toBe(false);
   expect(
      shouldProduceSourceMap("/src/main.js", {
         include: /\.ts$/,
         exclude: /\.js$/,
      })
   ).toBe(false);
   expect(
      shouldProduceSourceMap("/src/main.js", {
         include: (source) => /\.ts$/.test(source),
         exclude: (source) => /\.js$/.test(source),
      })
   ).toBe(false);
});