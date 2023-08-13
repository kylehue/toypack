import { EncodedSourceMap } from "@jridgewell/gen-mapping";
import MagicString from "magic-string";
import { mergeSourceMaps } from "../../utils";
import type { ScriptModule } from "src/types";

export class ModuleTransformer {
   private _s: MagicString;
   private _toUpdate: [[number, number], string][] = [];
   private _toInsert: [number, string][] = [];
   private _doneUpdates: [[number, number], string][] = [];
   private _doneInserts: [number, string][] = [];
   private _previousGenerated?: { content: string; map?: EncodedSourceMap };
   constructor(public module: ScriptModule) {
      this._s = new MagicString(module.content);
   }

   // TODO: remove
   private _rangesCollide(range1: [number, number], range2: [number, number]) {
      const [aStart, aEnd] = range1;
      const [bStart, bEnd] = range2;

      return (
         (aStart >= bStart && aStart <= bEnd) ||
         (aEnd >= bStart && aEnd <= bEnd) ||
         (bStart >= aStart && bStart <= aEnd) ||
         (bEnd >= aStart && bEnd <= aEnd)
      );
   }

   private _isDoneUpdate(start: number, end: number, content: string) {
      for (const [[_start, _end], _content] of this._doneUpdates) {
         if (start === _start && end === _end && content === _content) {
            return true;
         }
      }
      return false;
   }

   private _isDoneInsert(index: number, content: string) {
      for (const [_index, _content] of this._doneInserts) {
         if (index === _index && content === _content) {
            return true;
         }
      }
      return false;
   }

   private _initChanges() {
      while (this._toUpdate.length) {
         const toUpdate = this._toUpdate.shift()!;
         const [[start, end], content] = toUpdate;
         this._s.update(start, end, content, {
            storeName: true,
         });

         this._doneUpdates.push(toUpdate);
      }

      while (this._toInsert.length) {
         const toInsert = this._toInsert.shift()!;
         const [index, content] = toInsert;
         this._s.appendLeft(index, content);

         this._doneInserts.push(toInsert);
      }
   }

   public update(start: number, end: number, content: string) {
      if (this._isDoneUpdate(start, end, content)) return;
      this._toUpdate.push([[start, end], content]);
   }

   public insertAt(index: number, content: string) {
      if (this._isDoneInsert(index, content)) return;
      this._toInsert.push([index, content]);
   }

   public needsChange() {
      return this.module.asset.modified || !this._previousGenerated;
   }

   public generate() {
      if (!this.module.asset.modified && this._previousGenerated) {
         return this._previousGenerated;
      }

      this._initChanges();
      this._s.trim();

      const generated = {
         content: this._s.toString(),
         map: this._s.generateMap({
            source: this.module.source,
            includeContent: true,
            hires: "boundary",
         }) as EncodedSourceMap,
      };

      const module = this.module;
      const loadedMap =
         (module.asset.type == "text" ? module.asset.map : null) || module.map;
      if (loadedMap) {
         generated.map = !generated.map
            ? loadedMap
            : mergeSourceMaps(generated.map, loadedMap);
      }

      this._previousGenerated = generated;

      return generated;
   }
}
