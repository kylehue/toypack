/**
 * @vitest-environment jsdom
 */

import { expect, it } from "vitest";
import { parseURL } from "../../utils";

it("should emit a result", () => {
   expect(parseURL("path/to/file?hello&world=2")).toEqual({
      target: "path/to/file",
      query: "?hello&world=2",
      params: {
         hello: true,
         world: "2",
      },
   });
});

it("should have query in alphabetical order", () => {
   const parse = parseURL("path/to/file?eleven&four&cat&ant&bad&dog");
   expect(parse.query).toEqual("?ant&bad&cat&dog&eleven&four");
});

it("should order query by type (booleans before strings)", () => {
   const parse = parseURL("path/to/file?eleven=e&four=f&cat&ant=a&bad=b&dog");
   expect(parse.query).toEqual("?cat&dog&ant=a&bad=b&eleven=e&four=f");
});
