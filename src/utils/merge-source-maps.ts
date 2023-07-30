import {
   EncodedSourceMap,
   GenMapping,
   toEncodedMap,
   setSourceContent,
   maybeAddMapping,
   addMapping,
} from "@jridgewell/gen-mapping";
import {
   eachMapping,
   sourceContentFor,
   originalPositionFor,
   TraceMap,
   SourceMapInput,
} from "@jridgewell/trace-mapping";

export function mergeSourceMaps(
   oldMap: SourceMapInput,
   newMap: SourceMapInput
) {
   const oldMapConsumer = new TraceMap(Object.assign({}, oldMap));
   const newMapConsumer = new TraceMap(Object.assign({}, newMap));
   const mergedMapGenerator = new GenMapping();

   eachMapping(oldMapConsumer, function (map) {
      if (map.originalLine == null) return;

      const origPosInOldMap = originalPositionFor(newMapConsumer, {
         line: map.originalLine,
         column: map.originalColumn,
      });

      if (origPosInOldMap.line == null) return;
      if (origPosInOldMap.source == null) return;
      addMapping(mergedMapGenerator, {
         original: {
            line: origPosInOldMap.line,
            column: origPosInOldMap.column,
         },
         generated: {
            line: map.generatedLine,
            column: map.generatedColumn,
         },
         source: origPosInOldMap.source,
         name: origPosInOldMap.name || "",
         content: sourceContentFor(newMapConsumer, origPosInOldMap.source),
      });
   });

   const resultMap = toEncodedMap(mergedMapGenerator);
   return resultMap;
}
