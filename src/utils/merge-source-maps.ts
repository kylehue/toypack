import {
   EncodedSourceMap,
   GenMapping,
   toEncodedMap,
   setSourceContent,
   maybeAddMapping,
} from "@jridgewell/gen-mapping";
import {
   eachMapping,
   sourceContentFor,
   originalPositionFor,
   TraceMap,
} from "@jridgewell/trace-mapping";

export function mergeSourceMaps(
   oldMap: EncodedSourceMap,
   newMap: EncodedSourceMap
) {
   const oldMapConsumer = new TraceMap(oldMap);
   const newMapConsumer = new TraceMap(newMap);
   const mergedMapGenerator = new GenMapping({
      file: oldMap.file,
      sourceRoot: oldMap.sourceRoot,
   });

   const names = new Set<string>();

   eachMapping(newMapConsumer, function (map) {
      if (map.originalLine == null) return;

      const origPosInOldMap = originalPositionFor(oldMapConsumer, {
         line: map.originalLine,
         column: map.originalColumn,
      });

      if (origPosInOldMap.source == null) return;
      if (origPosInOldMap.name) names.add(origPosInOldMap.name);

      maybeAddMapping(mergedMapGenerator, {
         original: {
            line: origPosInOldMap.line,
            column: origPosInOldMap.column,
         },
         generated: {
            line: map.generatedLine,
            column: map.generatedColumn,
         },
         source: origPosInOldMap.source,
         name: map.name || "",
      });
   });

   // Add sources
   [newMapConsumer, oldMapConsumer].forEach(function (mapConsumer) {
      mapConsumer.sources.forEach(function (source, index) {
         if (!source) return;
         setSourceContent(
            mergedMapGenerator,
            source,
            sourceContentFor(mapConsumer, source)
         );
      });
   });

   const resultMap = toEncodedMap(mergedMapGenerator);
   return resultMap;
}
