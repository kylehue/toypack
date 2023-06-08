// https://github.com/jamiebuilds/min-indent
function minIndent(content: string) {
   const match = content.match(/^[ \t]*(?=\S)/gm);

   if (!match) {
      return 0;
   }

   return match.reduce((r, a) => Math.min(r, a.length), Infinity);
}

// https://github.com/sindresorhus/strip-indent
function stripIndent(content: string) {
   const indent = minIndent(content);

   if (indent === 0) {
      return content;
   }

   const regex = new RegExp(`^[ \\t]{${indent}}`, "gm");

   return content.replace(regex, "");
}

const defaultOptions = {
   indentSize: 2,
};

/**
 * A utility class for composing and manipulating code strings.
 * It provides indent-aware functions for precise control
 * over code formatting.
 */
export class CodeComposer {
   private lines: string[];
   private options: ICodeComposerOptions;

   /**
    * @param content The initial code content.
    */
   constructor(content?: string, options?: Partial<ICodeComposerOptions>) {
      this.options = Object.assign(Object.assign({}, defaultOptions), options);
      if (this.options.indentSize < 0) {
         throw new RangeError(
            "Indent size must be greater than or equal to zero."
         );
      }

      this.lines = CodeComposer.getLines(content || "");
   }

   static getLines(content: string | CodeComposer) {
      const lines: string[] = [];

      if (!content) return lines;

      if (typeof content == "string") {
         const split = content.split("\n");
         lines.push(...split);
      } else {
         lines.push(...content.lines);
      }

      return lines;
   }

   /**
    * Detects the indent size of a content.
    */
   static detectIndentSize(content: string | CodeComposer) {
      const lines = this.getLines(content);

      let detectedIndentSize = -1;
      let lastIndentSize = -1;

      for (let index = 0; index < lines.length; index++) {
         if (detectedIndentSize >= 0) break;
         const line = lines[index];
         const lineTrimmed = line.trim();

         // Skip empty lines
         const isLineEmpty = !lineTrimmed;
         if (isLineEmpty) continue;

         /**
          * Search for change in indent size. If indent size is
          * different from the last indent size, the detected
          * indent size is gonna be `|lastSize - currentSize|`
          */
         const lineIndentSize = line.indexOf(lineTrimmed);
         if (lineIndentSize != lastIndentSize && lastIndentSize != -1) {
            detectedIndentSize = Math.abs(lineIndentSize - lastIndentSize);
         }

         /**
          * The last indent size must be the indent size if
          * there is no change.
          */
         const isLast = index == lines.length - 1;
         if (isLast && detectedIndentSize == -1) {
            detectedIndentSize = lastIndentSize;
            break;
         }

         lastIndentSize = lineIndentSize;
      }

      detectedIndentSize = Math.max(0, detectedIndentSize);

      return detectedIndentSize;
   }

   /**
    * Removes leading or trailing whitespaces from the whole content
    * and strips leading whitespaces from each line of the content.
    */
   static trim(content: string | CodeComposer) {
      const lines = this.getLines(content);
      let resultString = " ".repeat(minIndent(lines.join("\n")));

      if (typeof content == "string") {
         resultString += content.trim();
      } else {
         resultString += lines.join("\n").trim();
      }

      return stripIndent(resultString);
   }

   /**
    * Change the indent size of a content.
    */
   static changeIndentSize(content: string | CodeComposer, size: number) {
      size = Math.floor(size);
      size = Math.max(0, size);

      const lines = this.getLines(content);
      const originalIndentSize = this.detectIndentSize(content);

      return lines
         .map((line) => {
            const lineTrimmed = line.trimStart();
            const lineIndent = line.indexOf(lineTrimmed);
            const targetIndent = originalIndentSize
               ? (lineIndent / originalIndentSize) * size
               : 0;
            return " ".repeat(targetIndent) + lineTrimmed;
         })
         .join("\n");
   }

   /**
    * Fix the indentation of a content. This will remove the whitespace,
    * strip the leading indent, and change the indent size.
    */
   static revampIndent(content: string | CodeComposer, size: number) {
      size = Math.floor(size);
      size = Math.max(0, size);

      return this.changeIndentSize(this.trim(content), size);
   }

   static removeLineBreaks(content: string | CodeComposer) {
      const lines = this.getLines(content);

      return lines.filter((line) => !!line.trim()).join("\n");
   }

   /**
    * Get the current indent size.
    */
   private getCurrentIndentSize() {
      let currentIndentSize = 0;
      for (const line of this.lines) {
         const lineTrimmed = line.trim();
         const isLineEmpty = !lineTrimmed;
         if (isLineEmpty) continue;
         currentIndentSize = line.indexOf(lineTrimmed);
         break;
      }

      return currentIndentSize;
   }

   /**
    * Indents each line of the code.
    */
   public indent() {
      this.lines.map((line, i) => {
         this.lines[i] = " ".repeat(this.options.indentSize) + line;
      });

      return this;
   }

   /**
    * Prepends the specified content to the beginning of the code.
    * @param content The content to prepend.
    * @returns The updated CodeComposer instance.
    */
   public prepend(content: string | CodeComposer) {
      const indentSize =
         CodeComposer.detectIndentSize(this) || this.options.indentSize;
      const revamped = CodeComposer.revampIndent(
         content,
         indentSize
      );
      const lines = CodeComposer.getLines(revamped);

      lines.forEach((line, index) => {
         lines[index] = " ".repeat(this.getCurrentIndentSize()) + line;
      });

      this.lines.unshift(...lines);

      return this;
   }

   /**
    * Appends the specified content to the end of the code.
    * @param content The content to append.
    * @returns The updated CodeComposer instance.
    */
   public append(content: string | CodeComposer) {
      const indentSize =
         CodeComposer.detectIndentSize(this) || this.options.indentSize;
      const revamped = CodeComposer.revampIndent(
         content,
         indentSize
      );
      const lines = CodeComposer.getLines(revamped);

      lines.forEach((line, index) => {
         lines[index] = " ".repeat(this.getCurrentIndentSize()) + line;
      });

      this.lines.push(...lines);

      return this;
   }

   public breakLine(amount = 1) {
      this.lines.push("\n".repeat(amount - 1));

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
    * })();`
    */
   public wrap(content: string) {
      const marker = "<CODE_BODY>";
      if (!content.includes(marker)) {
         throw new Error("The wrapping content must have a marker.");
      }
      this.indent();

      const [top, bottom] = content.split(marker);

      const indentSize =
         CodeComposer.detectIndentSize(this) || this.options.indentSize;
      const polishedTop = CodeComposer.changeIndentSize(
         CodeComposer.removeLineBreaks(stripIndent(top)),
         indentSize
      );
      const polishedBottom = CodeComposer.changeIndentSize(
         CodeComposer.removeLineBreaks(stripIndent(bottom)),
         indentSize
      );

      this.lines.unshift(...CodeComposer.getLines(polishedTop));
      this.lines.push(...CodeComposer.getLines(polishedBottom));

      return this;
   }

   /**
    * Converts the composed code into a string.
    */
   public toString() {
      return this.lines.join("\n");
   }

   public clone() {
      const clone = new CodeComposer(undefined, this.options);
      clone.lines = [...this.lines];
      return clone;
   }
}

type ICodeComposerOptions = typeof defaultOptions;