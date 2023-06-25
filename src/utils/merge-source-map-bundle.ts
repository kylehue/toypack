import {
   RawSourceMap,
   SourceMapConsumer,
   SourceMapGenerator,
} from "source-map-js";
import { Toypack } from "../Toypack.js";
import { findCodePosition } from "./find-code-position.js";

/**
 * Merge source map to bundle's source map.
 * @param targetMap The source map generator (bundle's source map)
 * to merge the source map from.
 * @param sourceMap The source map to merge to the bundle's source map.
 * @param source The file source path.
 * @param generatedContent The compiled content of the file.
 * @param bundleContent The current content of the bundle.
 * @param originalContent The original content of the file.
 */
export function mergeSourceMapToBundle(
   targetMap: SourceMapGenerator,
   sourceMap: RawSourceMap,
   source: string,
   generatedContent: string,
   bundleContent: string,
   originalContent?: string,
) {
   if (!targetMap) return;
   const position = findCodePosition(bundleContent, generatedContent);

   if (position.line == -1) {
      console.warn(
         `Warning: Source map discrepancy for '${source}'. The mappings may be inaccurate because the generated code's position could not be found in the bundle code.`
      );
   }

   const smc = new SourceMapConsumer(sourceMap);

   // Add source map's sources and contents to target map
   (smc as any).sources.forEach(function (sourceFile: string) {
      if (sourceFile == "unknown") return;
      (targetMap as any)._sources.add(sourceFile);
      const sourceContent = smc.sourceContentFor(sourceFile);
      if (sourceContent != null) {
         targetMap.setSourceContent(sourceFile, sourceContent);
      }
   });

   if (originalContent) {
      targetMap.setSourceContent(source, originalContent);
   }

   smc.eachMapping((map) => {
      if (map.originalLine === null) return;
      
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
}
