/**
 * @vitest-environment jsdom
 */

import { describe, expect, test } from "vitest";
import { addTwoNum } from "../Toypack.js";

describe("Adding two nums", () => {
   test("should add two nums", () => {
      expect(addTwoNum(2, 4)).toEqual(6);
   });
});