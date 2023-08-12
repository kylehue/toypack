import { EncodedSourceMap } from "@jridgewell/gen-mapping";
import MagicString from "magic-string";
import { mergeSourceMaps } from "../../utils";
import { DependencyGraph, ScriptModule } from "src/types";

// export interface ModuleDescriptor {
//    module: ScriptModule;
//    s: MagicString;
//    changedRanges: [number, number][];
// }

export function getModuleDescriptors(graph: DependencyGraph) {
   return Object.values(Object.fromEntries(graph))
      .filter((g): g is ScriptModule => g.isScript())
      .reverse()
      .map((x) => new ModuleDescriptor(x));
}

export class ModuleDescriptor {
   private _s: MagicString;
   private _map?: EncodedSourceMap;
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

   public update(start: number, end: number, content: string) {
      this._s.update(start, end, content, {
         storeName: true,
      });
   }

   public insertAt(index: number, content: string) {
      this._s.appendLeft(index, content);
   }

   public sliceGenerated(start: number, end: number) {
      return this._s.slice(start, end);
   }

   public sliceOriginal(start: number, end: number) {
      return this._s.original.slice(start, end);
   }

   public generate() {
      this._s.trim();
      let map = this._s.generateMap({
         source: this.module.source,
         includeContent: true,
         hires: "boundary",
      }) as EncodedSourceMap;

      map = this._map ? mergeSourceMaps(map, this._map) : map;

      return {
         content: this._s.toString(),
         map,
      };
   }
}
