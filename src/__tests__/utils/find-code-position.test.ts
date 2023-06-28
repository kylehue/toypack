/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { findCodePosition, indexToPosition } from "../../utils";

const sample = `
<!DOCTYPE html>
<html lang="en">
   <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Sample</title>
   </head>
   <body>
      <div id="app">
         <button>
            Click me!
         </button>
      </div>
   </body>
</html>
`.trim();

const indexOfDivApp = sample.indexOf(`<div id="app">`);
const indexOfClickMe = sample.indexOf(`Click me!`);
const indexOfTitle = sample.indexOf(`<title>Sample</title>`);
const indexOfInitialScale = sample.indexOf(`initial-scale=1.0`);

const positionOfDivApp = indexToPosition(sample, indexOfDivApp);
const positionOfClickMe = indexToPosition(sample, indexOfClickMe);
const positionOfTitle = indexToPosition(sample, indexOfTitle);
const positionOfInitialScale = indexToPosition(sample, indexOfInitialScale);

describe("indexToPosition", () => {
   it("should work", () => {
      expect(positionOfDivApp).toEqual({
         line: 9,
         column: 6,
      });
      expect(positionOfClickMe).toEqual({
         line: 11,
         column: 12,
      });
      expect(positionOfTitle).toEqual({
         line: 6,
         column: 6,
      });
      expect(positionOfInitialScale).toEqual({
         line: 5,
         column: 57,
      });
   });
});

describe("findCodePosition", () => {
   it("should work", () => {
      expect(findCodePosition(sample, `<div id="app">`)).toEqual(
         positionOfDivApp
      );
      expect(findCodePosition(sample, `Click me!`)).toEqual(positionOfClickMe);
      expect(findCodePosition(sample, `<title>Sample</title>`)).toEqual(
         positionOfTitle
      );
      expect(findCodePosition(sample, `initial-scale=1.0`)).toEqual(
         positionOfInitialScale
      );
   });

   it("should ignore whitespaces", () => {
      expect(
         findCodePosition(
            sample,
            `  <body>
      <div id="app">
                        <button>
            Click me!
                         </button>
        </div>
            </body>`
         )
      ).toEqual(indexToPosition(sample, sample.indexOf("<body>")));
   });

   it("should respect leading and trailing new lines", () => {
      expect(
         findCodePosition(
            sample,
            ` 
            <body>
      <div id="app">
                        <button>
            Click me!
                         </button>
        </div>
            </body>
         `
         )
      ).not.toEqual(indexToPosition(sample, sample.indexOf("<body>")));
   });
});
