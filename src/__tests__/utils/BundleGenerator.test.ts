/**
 * @vitest-environment jsdom
 */
// @ts-nocheck
import { expect, it, beforeEach } from "vitest";
import { BundleGenerator } from "../../utils";

const bundle = new BundleGenerator();

const sampleFiles = {
   "/index.js": `console.log("Hello world!");`,
   "/classes/Book.js": `class Book {}`,
   "/classes/Author.js": `class Author {}`,
};

beforeEach(() => {
   bundle.clear();
   for (const [source, content] of Object.entries(sampleFiles)) {
      bundle.add({
         source,
         content,
      });
   }
});

it("should bundle", () => {
   expect(bundle.toString()).toEqual(
      `
${sampleFiles["/index.js"]}
${sampleFiles["/classes/Book.js"]}
${sampleFiles["/classes/Author.js"]}
`.trim()
   );
});

it("should update", () => {
   bundle.update({
      source: "/classes/Book.js",
      content: "export class Book {}",
   });

   expect(bundle.toString()).toEqual(
      `
${sampleFiles["/index.js"]}
export class Book {}
${sampleFiles["/classes/Author.js"]}
`.trim()
   );
});

it("should remove", () => {
   bundle.remove("/classes/Book.js");

   expect(bundle.toString()).toEqual(
      `
${sampleFiles["/index.js"]}
${sampleFiles["/classes/Author.js"]}
`.trim()
   );
});

it("should have proper locs when removing", () => {
   bundle.remove("/classes/Book.js");
   expect(bundle._bundle["/index.js"].loc).toEqual({
      start: {
         index: 0,
         line: 1,
         column: 0,
      },
      end: {
         index: sampleFiles["/index.js"].length,
         line: 1,
         column: sampleFiles["/index.js"].length,
      },
   });
   expect(bundle._bundle["/classes/Author.js"].loc).toEqual({
      start: {
         index: sampleFiles["/index.js"].length + 1,
         line: 2,
         column: 0,
      },
      end: {
         index:
            sampleFiles["/index.js"].length +
            sampleFiles["/classes/Author.js"].length +
            1,
         line: 2,
         column: sampleFiles["/classes/Author.js"].length,
      },
   });
});

it("should have proper locs when updating", () => {
   const newContent = `export class Book {}`;
   bundle.update({
      source: "/classes/Book.js",
      content: newContent,
   });
   expect(bundle._bundle["/index.js"].loc).toEqual({
      start: {
         index: 0,
         line: 1,
         column: 0,
      },
      end: {
         index: sampleFiles["/index.js"].length,
         line: 1,
         column: sampleFiles["/index.js"].length,
      },
   });
   expect(bundle._bundle["/classes/Book.js"].loc).toEqual({
      start: {
         index: sampleFiles["/index.js"].length + 1,
         line: 2,
         column: 0,
      },
      end: {
         index: sampleFiles["/index.js"].length + newContent.length + 1,
         line: 2,
         column: newContent.length,
      },
   });
   expect(bundle._bundle["/classes/Author.js"].loc).toEqual({
      start: {
         index: sampleFiles["/index.js"].length + newContent.length + 2,
         line: 3,
         column: 0,
      },
      end: {
         index:
            sampleFiles["/index.js"].length +
            newContent.length +
            sampleFiles["/classes/Author.js"].length +
            2,
         line: 3,
         column: sampleFiles["/classes/Author.js"].length,
      },
   });
});
