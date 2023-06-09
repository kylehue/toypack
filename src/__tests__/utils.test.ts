/**
 * @vitest-environment jsdom
 */

import path from "path-browserify";
import { describe, expect, test, beforeAll } from "vitest";
import { createChunkSource, isChunk } from "../utils";

describe("Chunks", () => {
   test("Chunk source should match chunk pattern", () => {
      const sampleChunkSource = createChunkSource("test.js", "js", 1);
      expect(isChunk(sampleChunkSource)).toBeTruthy();
   });
});