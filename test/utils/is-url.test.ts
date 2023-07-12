/**
 * @vitest-environment jsdom
 */

import { expect, it } from "vitest";
import { isUrl } from "../../src/utils";

const url = "https://example.com/app";
const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAX0";
it("should be a url", () => {
   expect(isUrl(url)).toBeTruthy();
   expect(isUrl(dataUrl)).toBeTruthy();
});

it("should not be a url", () => {
   expect(isUrl("../path/to/file.js")).toBeFalsy();
   expect(isUrl("./path/to/file.js")).toBeFalsy();
   expect(isUrl("/path/to/file.js")).toBeFalsy();
   expect(isUrl("virtual:" + url)).toBeFalsy();
   expect(isUrl("")).toBeFalsy();
});
