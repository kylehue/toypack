import { findCodePosition } from "./utils.js";

/**
 * A utility class for composing and manipulating code strings.
 */
export class CodeComposer {
   private lines: string[];

   /**
    * @param content The initial code content.
    */
   constructor(content: string) {
      this.lines = content.split("\n");
   }

   /**
    * Indents each line of the code with the specified prefix.
    * @param prefix The string to use for indentation.
    * @returns The updated CodeComposer instance.
    */
   public indent(prefix = "  ") {
      this.lines.map((line, i) => {
         this.lines[i] = prefix + line;
      });

      return this;
   }

   /**
    * Prepends the specified content to the beginning of the code.
    * @param content The content to prepend.
    * @returns The updated CodeComposer instance.
    */
   public prepend(content: string) {
      this.lines.unshift(...content.split("\n"));

      return this;
   }

   /**
    * Appends the specified content to the end of the code.
    * @param content The content to append.
    * @returns The updated CodeComposer instance.
    */
   public append(content: string) {
      this.lines.push(...content.split("\n"));

      return this;
   }

   /**
    * Wraps the code with the specified content. The content must
    * include the marker `<CODE_BODY>` to indicate where the composed
    * code should be placed.
    * 
    * **Note**: The marker must have its own line.
    * @param content The content to append.
    * @returns The updated CodeComposer instance.
    * @example
    * let composer = new CodeComposer("console.log('Hello World!');")
    * composer.wrap(
    *    `(function() {
    *       <CODE_BODY>
    *    })();`
    * );
    *
    * composer.toString();
    *
    * // Result
    * `(function() {
    *    console.log('Hello World!');
    * })()`;
    */
   public wrap(content: string) {
      const marker = "<CODE_BODY>";
      if (content.indexOf(marker) == -1) {
         throw new Error("The wrapping content must have a marker.");
      }

      let lines: string[] = [];
      let targetColumn = findCodePosition(content, marker).column;
      let currentIndentSize = this.lines[0].indexOf(this.lines[0].trim());

      const split = content.trim().split("\n");
      split.map((line) => {
         const lineTrimmed = line.trim();
         if (lineTrimmed == marker) {
            lines.push(...this.lines);
            return;
         }

         let column = line.indexOf(lineTrimmed);
         if (column === targetColumn) {
            lines.push(" ".repeat(currentIndentSize) + lineTrimmed);
         } else {
            lines.push(lineTrimmed);
         }
      });

      this.lines = [...lines];

      return this;
   }

   /**
    * Converts the composed code into a string.
    */
   public toString() {
      return this.lines.join("\n");
   }

   public clone() {
      return new CodeComposer(this.toString());
   }
}
