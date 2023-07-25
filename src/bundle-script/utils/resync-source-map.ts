import { ScriptDependency } from "../../parse/index.js";
import {
   EncodedSourceMap,
   GenMapping,
   addMapping,
   maybeAddMapping,
   toEncodedMap,
} from "@jridgewell/gen-mapping";
import {
   SourceMapInput,
   TraceMap,
   eachMapping,
   generatedPositionFor,
   sourceContentFor,
} from "@jridgewell/trace-mapping";

export function resyncSourceMap(
   map: SourceMapInput,
   scriptModules: ScriptDependency[]
) {
   const mergedMapGenerator = new GenMapping();
   const generatedMap = new TraceMap(map);
   const unmappedScripts: Record<string, string> = {};
   for (const script of scriptModules) {
      if (!script.map) {
         unmappedScripts[script.source] = script.content;
         continue;
      }

      const scriptMap = new TraceMap(script.map as EncodedSourceMap);
      let lastCol = 0;
      eachMapping(scriptMap, (map) => {
         if (map.originalLine == null) return;
         const genPos = generatedPositionFor(generatedMap, {
            line: map.generatedLine,
            column: map.generatedColumn,
            source: script.source,
         });
         
         // No need to map every column
         if (lastCol == genPos.column) return;

         if (genPos.line == null) return;
         if (genPos.column == null) return;

         maybeAddMapping(mergedMapGenerator, {
            generated: {
               line: genPos.line,
               column: genPos.column,
            },
            original: {
               line: map.originalLine,
               column: map.originalColumn,
            },
            source: script.source,
            // @ts-ignore
            name: map.name || undefined,
            content: sourceContentFor(scriptMap, script.source),
         });

         lastCol = genPos.column;
      });
   }

   eachMapping(generatedMap, (map) => {
      if (map.originalLine == null) return;
      if (!map.source) return;
      const content = unmappedScripts[map.source];
      if (!content) return;
      maybeAddMapping(mergedMapGenerator, {
         generated: {
            line: map.generatedLine,
            column: map.generatedColumn,
         },
         original: {
            line: map.originalLine,
            column: map.originalColumn,
         },
         // @ts-ignore
         name: map.name || undefined,
         source: map.source,
         content: content,
      });
   });

   return toEncodedMap(mergedMapGenerator);
}
