import {
   RawSourceMap,
   SourceMapConsumer,
   SourceMapGenerator,
} from "source-map-js";
import MapConverter from "convert-source-map";
import path from "path-browserify";

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
   const sourcesWithMappings = new Set<string>();
   const names = new Set<string>();

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

      sourcesWithMappings.add(path.join("/", origPosInOldMap.source));

      if (origPosInOldMap.name) names.add(origPosInOldMap.name);

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

   const resultMap = MapConverter.fromJSON(
      mergedMapGenerator.toString()
   ).toObject() as RawSourceMap;
   resultMap.sources = [];
   resultMap.sourcesContent = [];
   resultMap.names = [...names];

   // Add sources
   [oldMap, newMap].forEach(function (map) {
      map.sources.forEach(function (sourceFile, index) {
         sourceFile = path.join("/", sourceFile);
         // Only add the ones that has mapping
         if (!sourcesWithMappings.has(sourceFile)) return;
         resultMap.sources.push(sourceFile);
         resultMap.sourcesContent!.push(map.sourcesContent?.[index] || "");
      });
   });

   resultMap.sourceRoot = oldMap.sourceRoot;
   resultMap.file = oldMap.file;

   return resultMap;
}
