import {
   RawSourceMap,
   SourceMapConsumer,
   SourceMapGenerator,
} from "source-map-js";
import { Toypack } from "../Toypack.js";
import { findCodePosition } from "./find-code-position.js";
import path from "path-browserify";
import { isLocal } from "./is-local.js";

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
   targetMap: SourceMapGenerator,
   sourceMap: RawSourceMap,
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

   const smc = new SourceMapConsumer(sourceMap);
   const sourcesWithMappings = new Set<string>();

   smc.eachMapping((map) => {
      if (map.originalLine === null) return;
      map.source = makeRelativeIfNeeded(map.source);
      sourcesWithMappings.add(map.source);

      targetMap.addMapping({
         source: map.source,
         original: {
            line: map.originalLine,
            column: map.originalColumn,
         },
         generated: {
            line: map.generatedLine + position.line - 1,
            column: map.generatedColumn + position.column,
         },
         name: map.name,
      });
   });

   // Add source map's sources and contents to target map
   sourceMap.sources.forEach(function (sourceFile) {
      sourceFile = makeRelativeIfNeeded(sourceFile);

      // Only add the ones that has mapping to save size
      if (!sourcesWithMappings.has(sourceFile)) return;
      const sourceContent = smc.sourceContentFor(sourceFile);
      if (sourceContent) {
         (targetMap as any)._sources.add(sourceFile);
         targetMap.setSourceContent(sourceFile, sourceContent);
      }
   });
}

function makeRelativeIfNeeded(source: string) {
   if (isLocal(source) && !source.startsWith("virtual:")) {
      source = path.join("/", source);
   }

   return source;
}
