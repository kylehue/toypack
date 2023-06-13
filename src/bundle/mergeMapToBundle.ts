import {
   RawSourceMap,
   SourceMapConsumer,
   SourceMapGenerator,
} from "source-map-js";
import { Toypack } from "../Toypack.js";
import { findCodePosition } from "../utils.js";

/**
 * Merge map to bundle.
 * @param targetMap The source map generator to merge the source map from.
 * @param sourceMap The source map to merge to the target source map.
 * @param source The file source path.
 * @param originalContent The original content of the file.
 * @param generatedContent The compiled content of the file.
 * @param bundleContent The current content of the bundle.
 */
export function mergeMapToBundle(
   this: Toypack,
   targetMap: SourceMapGenerator,
   sourceMap: RawSourceMap,
   source: string,
   originalContent: string,
   generatedContent: string,
   bundleContent: string
) {
   if (!targetMap) return;
   const position = findCodePosition(bundleContent, generatedContent);

   if (position.line == -1) {
      this.warn(
         `Warning: Source map discrepancy for '${source}'. The mappings may be inaccurate because the generated code's position could not be found in the bundle code.`
      );
   }

   const sourceMapOption = this.config.bundle.sourceMap;
   if (sourceMapOption != "nosources") {
      targetMap.setSourceContent(source, originalContent);
   }

   const smc = new SourceMapConsumer(sourceMap);
   smc.eachMapping((map) => {
      if (map.originalLine === null) return;

      targetMap.addMapping({
         source: source,
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
