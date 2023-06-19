import {
   RawSourceMap,
   SourceMapConsumer,
   SourceMapGenerator,
} from "source-map-js";

/**
 * Merge old source map and new source map and return merged.
 * If old or new source map value is falsy, return another one as it is.
 *
 * https://github.com/keik/merge-source-map
 */
export function mergeSourceMaps(oldMap: RawSourceMap, newMap: RawSourceMap) {
   if (!oldMap) return newMap;
   if (!newMap) return oldMap;

   const oldMapConsumer = new SourceMapConsumer(oldMap);
   const newMapConsumer = new SourceMapConsumer(newMap);
   const mergedMapGenerator = new SourceMapGenerator();

   // iterate on new map and overwrite original position of new map with one of old map
   newMapConsumer.eachMapping(function (map) {
      // pass when `originalLine` is null.
      // It occurs in case that the node does not have origin in original code.
      if (map.originalLine == null) return;

      const origPosInOldMap = oldMapConsumer.originalPositionFor({
         line: map.originalLine,
         column: map.originalColumn,
      });

      if (origPosInOldMap.source == null) return;

      mergedMapGenerator.addMapping({
         original: {
            line: origPosInOldMap.line,
            column: origPosInOldMap.column,
         },
         generated: {
            line: map.generatedLine,
            column: map.generatedColumn,
         },
         source: origPosInOldMap.source,
         name: origPosInOldMap.name,
      });
   });

   const consumers = [oldMapConsumer, newMapConsumer];
   consumers.forEach(function (consumer) {
      (consumer as any).sources.forEach(function (sourceFile: string) {
         if (sourceFile == "unknown") return;
         (mergedMapGenerator as any)._sources.add(sourceFile);
         const sourceContent = consumer.sourceContentFor(sourceFile);
         if (sourceContent != null) {
            mergedMapGenerator.setSourceContent(sourceFile, sourceContent);
         }
      });
   });

   (mergedMapGenerator as any)._sourceRoot = oldMap.sourceRoot;
   (mergedMapGenerator as any)._file = oldMap.file;

   return JSON.parse(mergedMapGenerator.toString()) as RawSourceMap;
}
