import {
   maybeAddMapping,
   GenMapping,
   setSourceContent,
} from "@jridgewell/gen-mapping";
import {
   eachMapping,
   sourceContentFor,
   SourceMapInput,
   TraceMap,
} from "@jridgewell/trace-mapping";

/**
 * Merge source map to bundle's source map.
 * @param targetMap The source map generator (bundle's source map)
 * to merge the source map from.
 * @param sourceMap The source map to merge to the bundle's source map.
 * @param position The position of the source map to the bundle.
 */
export function mergeSourceMapToBundle(
   targetMap: GenMapping,
   sourceMap: SourceMapInput,
   position: {
      line: number;
      column: number;
   }
) {
   if (position.line <= 0) {
      throw new RangeError([
         "Invalid position line number.",
         "It must be equal to or greater than 1.",
      ].join(" "));
   }

   const trace = new TraceMap(sourceMap);

   eachMapping(trace, (map) => {
      if (map.originalLine === null) return;
      if (!map.source) return;
      maybeAddMapping(targetMap, {
         source: map.source,
         original: {
            line: map.originalLine,
            column: map.originalColumn,
         },
         generated: {
            line: map.generatedLine + position.line - 1,
            column: map.generatedColumn + position.column,
         },
         name: map.name || "",
      });
   });

   // Add source map's sources and contents to target map
   trace.sources.forEach(function (source) {
      if (!source) return;
      const sourceContent = sourceContentFor(trace, source);
      if (sourceContent) {
         setSourceContent(targetMap, source, sourceContent);
      }
   });
}
