import {
   EncodedSourceMap,
   GenMapping,
   toDecodedMap,
   toEncodedMap,
} from "@jridgewell/gen-mapping";
import {
   TraceMap,
   eachMapping,
   allGeneratedPositionsFor,
   generatedPositionFor,
   originalPositionFor,
   sourceContentFor,
} from "@jridgewell/trace-mapping";
import { indexToPosition } from "./find-code-position";
import { mergeSourceMapToBundle } from "./merge-source-map-bundle";

export class BundleGenerator {
   private _scopes: Record<string, Scope> = {};
   private _mapping = new GenMapping();
   private _wrapper: [string, string] = ["", ""];

   constructor(wrapper?: [string, string]) {
      if (wrapper) this._wrapper = wrapper;
   }

   private _updateLocsBelowSource(
      source: string,
      offset: number,
      scope?: Scope
   ) {
      if (!scope) scope = this._scopes[source];
      if (!scope) return;
      const isDisposable = !this._scopes[source];
      const currentBundleStr = this.toString();
      const trace = new TraceMap(toDecodedMap(this._mapping));
      for (const otherScope of Object.values(this._scopes)) {
         const isAbove = scope.scopesBefore.has(otherScope);
         const isSelf = otherScope.source == scope.source;
         if (isSelf || isAbove) continue;
         otherScope.loc.start = getPosition(
            currentBundleStr,
            otherScope.loc.start.index + offset
         );
         otherScope.loc.end = getPosition(
            currentBundleStr,
            otherScope.loc.end.index + offset
         );
         if (isDisposable) {
            otherScope.scopesBefore.delete(scope);
         }

         // offset map
         // eachMapping(trace, (map) => {
            
         // });
      }
   }

   getLocationFor(source: string) {
      const scope = this._scopes[source];
      if (!scope) return;
      return Object.assign({}, scope.loc);
   }

   add({ source, content, map }: Data) {
      content += "\n";
      const loc = getDefaultLocation();

      this._scopes[source] = {
         content,
         source,
         loc,
         scopesBefore: new Set([...Object.values(this._scopes)]),
      };

      const currentBundleStr = this.toString();
      loc.start = getPosition(
         currentBundleStr,
         currentBundleStr.length - content.length + 1
      );
      loc.end = getPosition(currentBundleStr, currentBundleStr.length);

      if (map) {
         mergeSourceMapToBundle(
            this._mapping,
            map,
            source,
            content,
            currentBundleStr,
            loc.start
         );
      }
   }

   update({ source, content, map }: Data) {
      content += "\n";
      const scope = this._scopes[source];
      if (!scope) return;
      const lengthDelta = content.length - scope.content.length;
      scope.content = content;
      scope.loc.end = getPosition(
         this.toString(),
         scope.loc.end.index + lengthDelta
      );
      this._updateLocsBelowSource(scope.source, lengthDelta);
   }

   remove(source: string) {
      const scope = this._scopes[source];
      if (!scope) return;
      delete this._scopes[source];
      const lengthDelta = -scope.content.length;
      this._updateLocsBelowSource(scope.source, lengthDelta, scope);
   }

   clear() {
      this._scopes = {};
      this._mapping = new GenMapping();
   }

   toString() {
      let result = "";
      for (const scope of Object.values(this._scopes)) {
         result += scope.content;
      }

      result = this._wrapper[0] + result + this._wrapper[1];

      return result.trim();
   }

   getMap() {
      return toEncodedMap(this._mapping);
   }
}

function getPosition(content: string, index: number): Position {
   const position = indexToPosition(content, index);
   return {
      index,
      ...position,
   };
}

function getDefaultLocation() {
   const loc: Scope["loc"] = {
      start: { index: 0, line: 1, column: 0 },
      end: { index: 0, line: 1, column: 0 },
   };

   return loc;
}

interface Position {
   index: number;
   line: number;
   column: number;
}

interface Scope {
   source: string;
   content: string;
   loc: {
      start: Position;
      end: Position;
   };
   scopesBefore: Set<Scope>;
}

interface Data {
   source: string;
   content: string;
   map?: EncodedSourceMap | null;
}

(window as any).BundleGenerator = BundleGenerator;
const gen = new BundleGenerator();
const sampleFiles = {
   "/index.js": `console.log("Hello world!");`,
   "/classes/Book.js": `class Book {}`,
   "/classes/Author.js": `class Author {}`,
};
for (const [source, content] of Object.entries(sampleFiles)) {
   gen.add({
      source,
      content,
   });
}
(window as any).gen = gen;
