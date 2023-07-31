import { ScriptDependency } from "../../parse/index.js";
import {
   EncodedSourceMap,
   GenMapping,
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
   for (const module of scriptModules) {
      const sourceMap =
         (module.asset.type == "text" ? module.asset.map : null) || module.map;
      if (!sourceMap || (sourceMap && !sourceMap.mappings.length)) {
         unmappedScripts[module.source] = module.content;
         continue;
      }
      
      const traceMap = new TraceMap(sourceMap);
      let lastCol = 0;
      eachMapping(traceMap, (map) => {
         if (!map.source) return;
         const genPos = generatedPositionFor(generatedMap, {
            line: map.generatedLine,
            column: map.generatedColumn,
            source: module.source,
         });

         // No need to map every column
         if (lastCol == genPos.column) return;

         if (genPos.line == null) return;
         
         maybeAddMapping(mergedMapGenerator, {
            generated: {
               line: genPos.line,
               column: genPos.column,
            },
            original: {
               line: map.originalLine,
               column: map.originalColumn,
            },
            source: map.source,
            // @ts-ignore
            name: map.name || undefined,
            content: sourceContentFor(traceMap, map.source),
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
