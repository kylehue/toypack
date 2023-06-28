/**
 * @vitest-environment jsdom
 */

import { expect, it } from "vitest";
import { CodeComposer } from "../../utils";

it("should detect indent size", () => {
   expect(
      CodeComposer.detectIndentSize(`
      Hello
            Hello
   `)
   ).toBe(6);
   expect(
      CodeComposer.detectIndentSize(`
   Hello
            Hello
   `)
   ).toBe(9);
   expect(
      CodeComposer.detectIndentSize(`
      Hello
      Hello
   `)
   ).toBe(0);
   expect(
      CodeComposer.detectIndentSize(`
            Hello
      Hello
   `)
   ).toBe(6);
});

it("should properly revamp indent", () => {
   expect(
      CodeComposer.revampIndent(
         `
sample
      sample
            sample
      sample
sample
sample
      sample
            sample
      sample
sample
`,
         2
      )
   ).toEqual(
      `
sample
  sample
    sample
  sample
sample
sample
  sample
    sample
  sample
sample
`.trim()
   );
});