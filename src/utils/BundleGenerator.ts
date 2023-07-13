import { GenMapping, toEncodedMap } from "@jridgewell/gen-mapping";
import { SourceMapInput } from "@jridgewell/trace-mapping";
import { mergeSourceMapToBundle } from ".";

function replaceTemplates(
   content: string,
   templateArgs: Record<string, string>
) {
   let result = content;
   for (const [template, replacement] of Object.entries(templateArgs)) {
      result = result.replace(`\${${template}}`, replacement);
   }

   return result;
}

export class BundleGenerator {
   private _bundle = "";
   private _map: GenMapping | null = null;
   private _moduleWrapper: [string, string] | null = null;
   private _wrapper: [string, string] | null = null;
   private _lastLine = 1;

   setupModuleWrapper(head: string, foot: string) {
      this._moduleWrapper = [head, foot];
      this._lastLine += head.split("\n").length;
   }

   setupWrapper(head: string, foot: string) {
      this._wrapper = [head, foot];
      this._lastLine += head.split("\n").length;
      if (head.length) {
         this._bundle = head + "\n" + this._bundle;
      }
   }

   add(
      content: string,
      options?: {
         map?: SourceMapInput | null;
         moduleWrapperTemplates?: Record<string, string>;
         excludeWrap?: boolean;
      }
   ) {
      if (options?.map) {
         this._map ??= new GenMapping();

         mergeSourceMapToBundle(this._map, options.map, {
            line: this._lastLine,
            column: 0,
         });
      }

      if (this._moduleWrapper && options?.excludeWrap !== true) {
         const templates = options?.moduleWrapperTemplates || {};
         // TODO: add header's templates' lines to `this._lastLine`?
         const head = replaceTemplates(this._moduleWrapper[0], templates);
         const body = "\n" + content + "\n";
         const foot = replaceTemplates(this._moduleWrapper[1], templates);
         content = head.concat(body).concat(foot);
      }

      this._bundle += content + "\n";
      this._lastLine += content.split("\n").length;
   }

   generate() {
      let content = this._bundle;
      if (this._wrapper && this._wrapper[1].length) {
         content += "\n" + this._wrapper[1];
      }

      return {
         content,
         map: this._map ? toEncodedMap(this._map) : null,
      };
   }
}
