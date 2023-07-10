import { findCodePosition } from "./find-code-position.js";
import path from "path-browserify";
import { isLocal } from "./is-local.js";

import {
   maybeAddMapping,
   EncodedSourceMap,
   GenMapping,
   setSourceContent,
} from "@jridgewell/gen-mapping";
import {
   eachMapping,
   sourceContentFor,
   TraceMap,
} from "@jridgewell/trace-mapping";

/**
 * Merge source map to bundle's source map.
 * @param targetMap The source map generator (bundle's source map)
 * to merge the source map from.
 * @param sourceMap The source map to merge to the bundle's source map.
 * @param source The file source path.
 * @param generatedContent The compiled content of the file.
 * @param bundleContent The current content of the bundle.
 */
export function mergeSourceMapToBundle(
   targetMap: GenMapping,
   sourceMap: EncodedSourceMap,
   source: string,
   generatedContent: string,
   bundleContent: string
) {
   if (!targetMap) return;
   const position = findCodePosition(bundleContent, generatedContent);

   if (position.line == -1) {
      console.warn(
         `Warning: Source map discrepancy for '${source}'. The mappings may be inaccurate because the generated code's position could not be found in the bundle code.`
      );
   }

   const smc = new TraceMap(sourceMap);

   eachMapping(smc, (map) => {
      if (map.originalLine === null) return;
      if (!map.source) return;
      map.source = makeRelativeIfNeeded(map.source);
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
   smc.sources.forEach(function (source) {
      if (!source) return;
      // source = makeRelativeIfNeeded(source);

      // Only add the ones that has mapping to save size
      // if (!sourcesWithMappings.has(source)) return;
      const sourceContent = sourceContentFor(smc, source);
      if (sourceContent) {
         setSourceContent(targetMap, source, sourceContent);
      }
   });
}

function makeRelativeIfNeeded(source: string) {
   if (isLocal(source) && !source.startsWith("virtual:")) {
      source = path.join("/", source);
   }

   return source;
}
